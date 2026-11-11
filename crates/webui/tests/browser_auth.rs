use fantoccini::{Client, ClientBuilder, Locator};
use serde_json::json;

#[tokio::test]
#[ignore = "requires the real identity provider and managed browser"]
async fn real_provider_browser_auth() {
  let user = std::env::var("TEST_USER").expect("TEST_USER must be set");
  let email = std::env::var("TEST_USER_EMAIL").expect("TEST_USER_EMAIL must be set");
  let password = std::env::var("TEST_PASSWORD").expect("TEST_PASSWORD must be set");
  rustls::crypto::ring::default_provider()
    .install_default()
    .expect("install rustls crypto provider");
  let mut caps = serde_json::Map::new();
  caps.insert("goog:chromeOptions".into(), json!({"args": ["--headless=new"]}));
  let client = ClientBuilder::rustls()
    .expect("WebDriver TLS setup failed")
    .capabilities(caps)
    .connect("http://127.0.0.1:17812")
    .await
    .expect("WebDriver session could not start");
  let result = journey(&client, &user, &email, &password).await;
  if result.is_err() {
    let diagnostic = client
      .execute(
        r##"return {
          root: !!document.querySelector("#app .nsh-root"),
          views: document.querySelectorAll("#app .nsh-v").length,
          rootHidden: !!document.querySelector("#app .nsh-root.nsh-hidden"),
          loading: !!document.querySelector("#status:not([hidden]):not(.failed)"),
          failed: !!document.querySelector("#status.failed"),
          iframes: document.querySelectorAll("iframe").length,
          hiddenIframes: document.querySelectorAll("iframe[hidden]").length,
          signIn: !!document.querySelector("#app [aria-label='Sign in']"),
          signInButton: !!document.querySelector("#app [role='button']:has([aria-label='Sign in'])"),
          signedOut: !!document.querySelector("#app [aria-label='Sign in to Pairidaeza']"),
          account: !!document.querySelector("#app [aria-label='Account']"),
          logout: !!document.querySelector("#app [aria-label='Log out']"),
          workspaceLoading: !!document.querySelector("#app [aria-label='Loading workspace']"),
          retry: !!document.querySelector("#app [aria-label='Retry']"),
          providerUser: !!document.querySelector("input[name='loginName']"),
          providerPassword: !!document.querySelector("input[type='password']")
        }"##,
        vec![],
      )
      .await;
    match diagnostic {
      Ok(value) => eprintln!("browser surface diagnostics: {value}"),
      Err(_) => eprintln!("browser surface diagnostics unavailable"),
    }
    let status = client
      .execute_async(
        "const done = arguments[arguments.length - 1]; if (location.origin !== 'http://127.0.0.1:17811') { done(-1); return; } fetch('/api/data/bootstrap').then(r => done(r.status)).catch(() => done(0));",
        vec![],
      )
      .await;
    match status {
      Ok(value) => eprintln!("browser bootstrap diagnostic status: {value}"),
      Err(_) => eprintln!("browser bootstrap diagnostic unavailable"),
    }
  }
  let closed = client.close().await;
  assert_eq!(result, Ok(()), "browser authentication journey failed");
  assert!(closed.is_ok(), "WebDriver session could not close");
}

async fn journey(client: &Client, user: &str, email: &str, password: &str) -> Result<(), &'static str> {
  client.goto("http://127.0.0.1:17811/").await.map_err(|_| "open app")?;
  client
    .wait()
    .for_element(Locator::Css("#app .nsh-root"))
    .await
    .map_err(|_| "wait for browser runtime")?;
  client
    .wait()
    .for_element(Locator::Css("#app .nsh-root [aria-label='Sign in']"))
    .await
    .map_err(|_| "find sign-in button")?
    .click()
    .await
    .map_err(|_| "click sign-in")?;
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
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Account']"))
    .await
    .map_err(|_| "wait for callback and bootstrap")?
    .click()
    .await
    .map_err(|_| "open account")?;
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Log out']"))
    .await
    .map_err(|_| "wait for account menu")?;
  let profile = client
    .execute(
      "return [...document.querySelectorAll('[aria-label]')].some(el => el.getAttribute('aria-label') === arguments[0])",
      vec![json!(email)],
    )
    .await
    .map_err(|_| "read account")?;
  if profile != json!(true) {
    return Err("account must show provider email");
  }
  let bootstrap = client.execute_async("const done = arguments[arguments.length - 1]; fetch('/api/data/bootstrap').then(async r => { const b = await r.json(); done(r.ok && b.user.email === arguments[0] && b.documents.models.state.providers.some(p => p.id === 'openai-codex' && p.name === 'OpenAI Codex' && p.model === 'gpt-5.6-luna')); }).catch(() => done(false));", vec![json!(email)]).await.map_err(|_| "read bootstrap")?;
  if bootstrap != json!(true) {
    return Err("authenticated fixture bootstrap must succeed");
  }
  client.refresh().await.map_err(|_| "reload app")?;
  client
    .wait()
    .for_element(Locator::Css("#app .nsh-root"))
    .await
    .map_err(|_| "wait for reloaded runtime")?;
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Account']"))
    .await
    .map_err(|_| "wait for reloaded account")?
    .click()
    .await
    .map_err(|_| "open reloaded account")?;
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Log out']"))
    .await
    .map_err(|_| "wait for reloaded account menu")?;
  let profile = client
    .execute(
      "return [...document.querySelectorAll('[aria-label]')].some(el => el.getAttribute('aria-label') === arguments[0])",
      vec![json!(email)],
    )
    .await
    .map_err(|_| "read reloaded account")?;
  if profile != json!(true) {
    return Err("provider account must persist across reload");
  }
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Log out']"))
    .await
    .map_err(|_| "find logout")?
    .click()
    .await
    .map_err(|_| "click logout")?;
  client
    .wait()
    .for_element(Locator::Css("[aria-label='Sign in to Pairidaeza']"))
    .await
    .map_err(|_| "wait for signed-out screen")?;
  let status = client
    .execute_async(
      "const done = arguments[arguments.length - 1]; fetch('/api/data/bootstrap').then(r => done(r.status)).catch(() => done(0));",
      vec![],
    )
    .await
    .map_err(|_| "read signed-out bootstrap")?;
  if status != json!(401) {
    return Err("logged-out bootstrap must be unauthorized");
  }
  Ok(())
}
