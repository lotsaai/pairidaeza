use axum::http::{HeaderMap, header::ORIGIN};
use url::{Host, Url};

pub(crate) fn web_origin(value: &str) -> Option<Url> {
  let url = Url::parse(value).ok()?;
  if !url.username().is_empty() || url.password().is_some() || url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
    return None;
  }
  let allowed = match (url.scheme(), url.host()) {
    ("https", Some(_)) => true,
    ("http", Some(Host::Ipv4(address))) => address.is_loopback(),
    ("http", Some(Host::Ipv6(address))) => address.is_loopback(),
    ("http", Some(Host::Domain("localhost"))) => true,
    _ => false,
  };
  allowed.then_some(url)
}

pub(crate) fn mutation_allowed(headers: &HeaderMap, origin: &Url) -> bool {
  let mut origins = headers.get_all(ORIGIN).iter();
  let mut markers = headers.get_all("x-pairidaeza-request").iter();
  let expected = origin.origin().ascii_serialization();
  origins.next().is_some_and(|value| value.as_bytes() == expected.as_bytes())
    && origins.next().is_none()
    && markers.next().is_some_and(|value| value == "1")
    && markers.next().is_none()
}

#[cfg(test)]
mod tests {
  use super::*;
  use axum::http::HeaderValue;

  #[test]
  fn mutation_requires_same_origin_and_custom_header() {
    let origin = web_origin("https://app.example.com").unwrap();
    let mut headers = HeaderMap::new();
    assert!(!mutation_allowed(&headers, &origin));
    headers.insert(ORIGIN, HeaderValue::from_static("https://attacker.example.com"));
    headers.insert("x-pairidaeza-request", HeaderValue::from_static("1"));
    assert!(!mutation_allowed(&headers, &origin));
    headers.insert(ORIGIN, HeaderValue::from_static("https://app.example.com"));
    assert!(mutation_allowed(&headers, &origin));
    headers.append(ORIGIN, HeaderValue::from_static("https://attacker.example.com"));
    assert!(!mutation_allowed(&headers, &origin));
    headers.insert(ORIGIN, HeaderValue::from_static("https://app.example.com"));
    headers.remove("x-pairidaeza-request");
    assert!(!mutation_allowed(&headers, &origin));
  }

  #[test]
  fn insecure_origin_only_allows_loopback() {
    assert!(web_origin("http://localhost:17800").is_some());
    assert!(web_origin("http://127.0.0.1:17800").is_some());
    assert!(web_origin("https://app.example.com").is_some());
    assert!(web_origin("http://app.example.com").is_none());
    assert!(web_origin("https://app.example.com/path").is_none());
    assert!(web_origin("https://user@app.example.com").is_none());
  }
}
