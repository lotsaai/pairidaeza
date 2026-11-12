use nsh_core::prelude::*;

/// Native OpenID Connect authorization operations.
#[module]
pub struct NativeAuth;

#[module]
impl NativeAuth {
  /// Starts a PKCE authorization transaction and returns its browser URL and private transaction state.
  pub async fn begin() -> Result<String, String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
      background(native::begin()).await.map_err(|e| e.to_string())?
    }
    #[cfg(target_arch = "wasm32")]
    {
      Err("Native authentication is unavailable on web".into())
    }
  }

  /// Validates a callback and exchanges its code for provider tokens.
  pub async fn finish(transaction: String, callback: String) -> Result<String, String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
      background(native::finish(transaction, callback)).await.map_err(|e| e.to_string())?
    }
    #[cfg(target_arch = "wasm32")]
    {
      let _ = (transaction, callback);
      Err("Native authentication is unavailable on web".into())
    }
  }

  /// Refreshes a provider access token.
  pub async fn refresh(refresh_token: String) -> Result<String, String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
      background(native::refresh(refresh_token)).await.map_err(|e| e.to_string())?
    }
    #[cfg(target_arch = "wasm32")]
    {
      let _ = refresh_token;
      Err("Native authentication is unavailable on web".into())
    }
  }
}

#[cfg(not(target_arch = "wasm32"))]
mod native {
  use openidconnect::{
    AuthenticationFlow, AuthorizationCode, ClientId, CsrfToken, IssuerUrl, Nonce, OAuth2TokenResponse, PkceCodeChallenge, PkceCodeVerifier,
    RedirectUrl, RefreshToken, Scope,
    core::{CoreClient, CoreProviderMetadata, CoreResponseType, CoreUserInfoClaims},
  };
  use serde::{Deserialize, Serialize};

  const ISSUER: &str = "https://auth.lotsa.ai";
  const CLIENT: &str = env!("PAIRIDAEZA_AUTH__NATIVE_CLIENT_ID");
  const REDIRECT: &str = "ai.lotsa.pairidaeza:/auth";
  const AUDIENCE: &str = "urn:zitadel:iam:org:project:id:399106433292993198:aud";

  #[derive(Serialize, Deserialize)]
  struct Transaction {
    state: String,
    nonce: String,
    verifier: String,
  }

  fn http_client() -> Result<reqwest::Client, String> {
    let builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    #[cfg(target_os = "android")]
    let builder = {
      let certificates = webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .map(|certificate| reqwest::Certificate::from_der(certificate.as_ref()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
      builder.tls_certs_only(certificates)
    };
    builder.build().map_err(|e| e.to_string())
  }

  async fn request(client: reqwest::Client, request: http::Request<Vec<u8>>) -> Result<http::Response<Vec<u8>>, reqwest::Error> {
    let response = client.execute(request.try_into()?).await?;
    let status = response.status();
    let headers = response.headers().clone();
    let mut result = http::Response::new(response.bytes().await?.to_vec());
    *result.status_mut() = status;
    *result.headers_mut() = headers;
    Ok(result)
  }

  fn serialize_tokens(response: &openidconnect::core::CoreTokenResponse, old_refresh: Option<String>) -> Result<String, String> {
    let refresh = response.refresh_token().map(|t| t.secret().to_owned()).or(old_refresh);
    serde_json::to_string(&serde_json::json!({
      "accessToken": response.access_token().secret(),
      "refreshToken": refresh,
      "expiresAt": response.expires_in().map(|d| std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() + d.as_secs()),
    })).map_err(|e| e.to_string())
  }

  pub async fn begin() -> Result<String, String> {
    let http = http_client()?;
    let send = |r| request(http.clone(), r);
    let metadata = CoreProviderMetadata::discover_async(IssuerUrl::new(ISSUER.into()).map_err(|e| e.to_string())?, &send)
      .await
      .map_err(|e| e.to_string())?;
    let client = CoreClient::from_provider_metadata(metadata, ClientId::new(CLIENT.into()), None)
      .set_redirect_uri(RedirectUrl::new(REDIRECT.into()).map_err(|e| e.to_string())?);
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state, nonce) = client
      .authorize_url(
        AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
        CsrfToken::new_random,
        Nonce::new_random,
      )
      .add_scope(Scope::new("profile".into()))
      .add_scope(Scope::new("email".into()))
      .add_scope(Scope::new("offline_access".into()))
      .add_scope(Scope::new(AUDIENCE.into()))
      .set_pkce_challenge(challenge)
      .url();
    let transaction = Transaction {
      state: state.secret().to_owned(),
      nonce: nonce.secret().to_owned(),
      verifier: verifier.secret().to_owned(),
    };
    serde_json::to_string(
      &serde_json::json!({ "url": url.as_str(), "transaction": serde_json::to_string(&transaction).map_err(|e| e.to_string())? }),
    )
    .map_err(|e| e.to_string())
  }

  pub async fn finish(transaction: String, callback: String) -> Result<String, String> {
    let transaction: Transaction = serde_json::from_str(&transaction).map_err(|e| e.to_string())?;
    let url = url::Url::parse(&callback).map_err(|e| e.to_string())?;
    if url.scheme() != "ai.lotsa.pairidaeza" || url.host_str().is_some() || url.path() != "/auth" || url.fragment().is_some() {
      return Err("Invalid callback".into());
    }
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for (key, value) in url.query_pairs() {
      let slot = match key.as_ref() {
        "code" => &mut code,
        "state" => &mut state,
        "error" => &mut error,
        _ => continue,
      };
      if slot.replace(value.into_owned()).is_some() {
        return Err("Duplicate callback parameter".into());
      }
    }
    if state.as_deref() != Some(transaction.state.as_str()) {
      return Err("Invalid authorization state".into());
    }
    if error.is_some() {
      return Err("Sign-in was not completed".into());
    }
    let code = code.filter(|s| !s.is_empty()).ok_or("Missing authorization code")?;
    let http = http_client()?;
    let send = |r| request(http.clone(), r);
    let metadata = CoreProviderMetadata::discover_async(IssuerUrl::new(ISSUER.into()).map_err(|e| e.to_string())?, &send)
      .await
      .map_err(|e| e.to_string())?;
    let client = CoreClient::from_provider_metadata(metadata, ClientId::new(CLIENT.into()), None)
      .set_redirect_uri(RedirectUrl::new(REDIRECT.into()).map_err(|e| e.to_string())?);
    let response = client
      .exchange_code(AuthorizationCode::new(code))
      .map_err(|e| e.to_string())?
      .set_pkce_verifier(PkceCodeVerifier::new(transaction.verifier))
      .request_async(&send)
      .await
      .map_err(|e| e.to_string())?;
    let verifier = client.id_token_verifier().set_other_audience_verifier_fn(trusted_audience);
    let nonce = Nonce::new(transaction.nonce);
    let claims = response
      .extra_fields()
      .id_token()
      .ok_or("Missing ID token")?
      .claims(&verifier, &nonce)
      .map_err(|e| e.to_string())?;
    let _: CoreUserInfoClaims = client
      .user_info(response.access_token().clone(), Some(claims.subject().clone()))
      .map_err(|e| e.to_string())?
      .request_async(&send)
      .await
      .map_err(|e| e.to_string())?;
    serialize_tokens(&response, None)
  }

  fn trusted_audience(audience: &openidconnect::Audience) -> bool {
    audience.as_str() == env!("PAIRIDAEZA_AUTH__PROJECT_ID") || audience.as_str() == env!("PAIRIDAEZA_AUTH__CLIENT_ID")
  }

  pub async fn refresh(refresh_token: String) -> Result<String, String> {
    let http = http_client()?;
    let send = |r| request(http.clone(), r);
    let metadata = CoreProviderMetadata::discover_async(IssuerUrl::new(ISSUER.into()).map_err(|e| e.to_string())?, &send)
      .await
      .map_err(|e| e.to_string())?;
    let client = CoreClient::from_provider_metadata(metadata, ClientId::new(CLIENT.into()), None);
    let response = client
      .exchange_refresh_token(&RefreshToken::new(refresh_token.clone()))
      .map_err(|e| e.to_string())?
      .request_async(&send)
      .await
      .map_err(|e| e.to_string())?;
    serialize_tokens(&response, Some(refresh_token))
  }

  #[cfg(test)]
  mod tests {
    use super::*;

    #[test]
    fn only_configured_additional_audiences_are_trusted() {
      for audience in [env!("PAIRIDAEZA_AUTH__PROJECT_ID"), env!("PAIRIDAEZA_AUTH__CLIENT_ID")] {
        assert!(trusted_audience(&openidconnect::Audience::new(audience.into())));
      }
      for audience in ["", "untrusted-client", "399106433292993198-extra"] {
        assert!(!trusted_audience(&openidconnect::Audience::new(audience.into())));
      }
    }

    #[test]
    fn token_serialization_preserves_optional_and_rotated_refresh_tokens() {
      use openidconnect::core::CoreTokenResponse;
      use serde_json::json;

      let response: CoreTokenResponse = serde_json::from_value(json!({"access_token": "access", "token_type": "Bearer"})).unwrap();
      let tokens: serde_json::Value = serde_json::from_str(&serialize_tokens(&response, None).unwrap()).unwrap();
      assert_eq!(tokens["accessToken"], "access");
      assert_eq!(tokens["refreshToken"], serde_json::Value::Null);
      let tokens: serde_json::Value = serde_json::from_str(&serialize_tokens(&response, Some("old".into())).unwrap()).unwrap();
      assert_eq!(tokens["refreshToken"], "old");

      let rotated: CoreTokenResponse =
        serde_json::from_value(json!({"access_token": "access", "token_type": "Bearer", "refresh_token": "new"})).unwrap();
      let tokens: serde_json::Value = serde_json::from_str(&serialize_tokens(&rotated, Some("old".into())).unwrap()).unwrap();
      assert_eq!(tokens["refreshToken"], "new");
    }

    #[tokio::test]
    #[ignore = "requires the real identity provider"]
    async fn provider_authorization_request_binds_pkce_state_and_nonce() {
      let result: serde_json::Value = serde_json::from_str(&begin().await.unwrap()).unwrap();
      let transaction: Transaction = serde_json::from_str(result["transaction"].as_str().unwrap()).unwrap();
      let url = url::Url::parse(result["url"].as_str().unwrap()).unwrap();
      let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
      let verifier = PkceCodeVerifier::new(transaction.verifier);
      let challenge = PkceCodeChallenge::from_code_verifier_sha256(&verifier);
      assert_eq!(params.get("state").map(String::as_str), Some(transaction.state.as_str()));
      assert_eq!(params.get("nonce").map(String::as_str), Some(transaction.nonce.as_str()));
      assert_eq!(params.get("code_challenge").map(String::as_str), Some(challenge.as_str()));
      assert_eq!(params.get("code_challenge_method").map(String::as_str), Some("S256"));
    }

    fn callback_from_event(message: &serde_json::Value) -> Option<&str> {
      let event = &message["message"];
      let params = &event["params"];
      let headers = [
        &params["headers"],
        &params["response"]["headers"],
        &params["redirectResponse"]["headers"],
      ];
      let locations = headers.into_iter().filter_map(|headers| {
        headers
          .as_object()?
          .iter()
          .find_map(|(key, value)| key.eq_ignore_ascii_case("location").then(|| value.as_str()).flatten())
      });
      let navigation = match event["method"].as_str() {
        Some("Network.requestWillBeSent") => params["request"]["url"].as_str(),
        Some("Page.frameRequestedNavigation" | "Page.frameScheduledNavigation") => params["url"].as_str(),
        _ => None,
      };
      locations
        .chain(navigation)
        .find(|value| url::Url::parse(value).is_ok_and(|url| url.scheme() == "ai.lotsa.pairidaeza"))
    }

    #[test]
    fn captures_native_redirect_from_chrome_events() {
      use serde_json::json;

      let callback = "ai.lotsa.pairidaeza:/auth?code=example&state=example";
      for event in [
        json!({"message": {"method": "Network.responseReceivedExtraInfo", "params": {"headers": {"location": callback}}}}),
        json!({"message": {"method": "Network.requestWillBeSent", "params": {"redirectResponse": {"headers": {"Location": callback}}}}}),
        json!({"message": {"method": "Network.requestWillBeSent", "params": {"request": {"url": callback}}}}),
        json!({"message": {"method": "Page.frameRequestedNavigation", "params": {"url": callback}}}),
      ] {
        assert_eq!(callback_from_event(&event), Some(callback));
      }
      assert!(callback_from_event(&json!({"message": {"params": {"headers": {"Location": "https://example.com/"}}}})).is_none());
    }

    #[tokio::test]
    #[ignore = "requires the real identity provider and managed browser"]
    async fn real_provider_native_finish_and_bootstrap() {
      use fantoccini::{Client, ClientBuilder, Locator};
      use serde_json::{Value, json};

      async fn journey(client: &Client, user: &str, email: &str, password: &str) -> Result<(), &'static str> {
        let started: Value =
          serde_json::from_str(&begin().await.map_err(|_| "start native authorization")?).map_err(|_| "parse native authorization")?;
        let url = started["url"].as_str().ok_or("missing authorization URL")?;
        let transaction = started["transaction"].as_str().ok_or("missing transaction")?;
        client.goto(url).await.map_err(|_| "open authorization")?;
        client
          .wait()
          .for_element(Locator::Css("input[name='loginName']"))
          .await
          .map_err(|_| "find provider username")?
          .send_keys(user)
          .await
          .map_err(|_| "enter provider username")?;
        client
          .find(Locator::Css("button[type='submit']"))
          .await
          .map_err(|_| "find username submit")?
          .click()
          .await
          .map_err(|_| "submit username")?;
        client
          .wait()
          .for_element(Locator::Css("input[type='password']"))
          .await
          .map_err(|_| "find provider password")?
          .send_keys(password)
          .await
          .map_err(|_| "enter provider password")?;
        client
          .find(Locator::Css("button[type='submit']"))
          .await
          .map_err(|_| "find password submit")?
          .click()
          .await
          .map_err(|_| "submit password")?;

        let session = client
          .session_id()
          .await
          .map_err(|_| "read browser session")?
          .ok_or("missing browser session")?;
        let http = reqwest::Client::new();
        let log_url = format!("http://127.0.0.1:17812/session/{session}/se/log");
        let mut callback = None;
        for _ in 0..60 {
          let entries: Value = http
            .post(&log_url)
            .json(&json!({"type": "performance"}))
            .send()
            .await
            .map_err(|_| "read browser network events")?
            .error_for_status()
            .map_err(|_| "browser network events rejected")?
            .json()
            .await
            .map_err(|_| "parse browser network events")?;
          if let Some(entries) = entries["value"].as_array() {
            for entry in entries {
              let Some(message) = entry["message"].as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()) else {
                continue;
              };
              callback = callback_from_event(&message).map(str::to_owned);
              if callback.is_some() {
                break;
              }
            }
          }
          if callback.is_some() {
            break;
          }
          tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        let callback = callback.ok_or("provider did not redirect to native callback")?;
        let tokens: Value = serde_json::from_str(
          &finish(transaction.to_owned(), callback)
            .await
            .map_err(|_| "finish native authorization")?,
        )
        .map_err(|_| "parse native tokens")?;
        let access = tokens["accessToken"]
          .as_str()
          .filter(|value| !value.is_empty())
          .ok_or("missing access token")?;
        let bootstrap: Value = http
          .get("http://127.0.0.1:17810/api/data/bootstrap")
          .bearer_auth(access)
          .send()
          .await
          .map_err(|_| "request native bootstrap")?
          .error_for_status()
          .map_err(|_| "native bootstrap rejected")?
          .json()
          .await
          .map_err(|_| "parse native bootstrap")?;
        let fixture = bootstrap["documents"]["models"]["state"]["providers"]
          .as_array()
          .is_some_and(|providers| {
            providers
              .iter()
              .any(|provider| provider["id"] == "openai-codex" && provider["name"] == "OpenAI Codex" && provider["model"] == "gpt-5.6-luna")
          });
        if bootstrap["user"]["email"].as_str() != Some(email) || !fixture {
          return Err("native bootstrap missing provider profile or workspace");
        }
        Ok(())
      }

      let user = std::env::var("TEST_USER").expect("TEST_USER must be set");
      let email = std::env::var("TEST_USER_EMAIL").expect("TEST_USER_EMAIL must be set");
      let password = std::env::var("TEST_PASSWORD").expect("TEST_PASSWORD must be set");
      rustls::crypto::ring::default_provider()
        .install_default()
        .expect("install rustls crypto provider");
      let mut caps = serde_json::Map::new();
      caps.insert("goog:chromeOptions".into(), json!({"args": ["--headless=new"]}));
      caps.insert("goog:loggingPrefs".into(), json!({"performance": "ALL"}));
      let client = ClientBuilder::rustls()
        .expect("WebDriver TLS setup failed")
        .capabilities(caps)
        .connect("http://127.0.0.1:17812")
        .await
        .expect("WebDriver session could not start");
      let result = journey(&client, &user, &email, &password).await;
      let closed = client.close().await;
      assert_eq!(result, Ok(()), "native provider authentication journey failed");
      assert!(closed.is_ok(), "WebDriver session could not close");
    }

    #[tokio::test]
    async fn callback_rejects_invalid_redirects_and_parameters_before_network() {
      let tx = serde_json::to_string(&Transaction {
        state: "expected".into(),
        nonce: "nonce".into(),
        verifier: "verifier".into(),
      })
      .unwrap();
      for callback in [
        "https://auth.lotsa.ai/auth?code=x&state=expected",
        "ai.lotsa.pairidaeza://host/auth?code=x&state=expected",
        "ai.lotsa.pairidaeza:/auth?code=x&state=expected#fragment",
        "ai.lotsa.pairidaeza:/auth?code=x",
        "ai.lotsa.pairidaeza:/auth?code=x&state=wrong",
        "ai.lotsa.pairidaeza:/auth?code=x&state=expected&state=expected",
        "ai.lotsa.pairidaeza:/auth?code=x&code=y&state=expected",
        "ai.lotsa.pairidaeza:/auth?error=a&error=b&state=expected",
        "ai.lotsa.pairidaeza:/auth?code=&state=expected",
        "ai.lotsa.pairidaeza:/auth?error=access_denied&state=expected",
        "ai.lotsa.pairidaeza:/other?code=x&state=expected",
      ] {
        assert!(finish(tx.clone(), callback.into()).await.is_err());
      }
    }
  }
}
