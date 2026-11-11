use openidconnect::{HttpRequest, HttpResponse};

pub(crate) async fn request(client: &reqwest::Client, request: HttpRequest) -> Result<HttpResponse, reqwest::Error> {
  let response = client.execute(reqwest::Request::try_from(request)?).await?;
  let status = response.status();
  let headers = response.headers().clone();
  let body = response.bytes().await?.to_vec();
  let mut result = HttpResponse::new(body);
  *result.status_mut() = status;
  *result.headers_mut() = headers;
  Ok(result)
}
