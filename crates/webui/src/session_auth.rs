use std::fmt;

use axum_login::{AuthUser, AuthnBackend};

use crate::session_data::{Identity, SessionData};

#[derive(Clone)]
pub(crate) struct User(pub(crate) Identity);

impl fmt::Debug for User {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("User").field("id", &self.0.id).finish_non_exhaustive()
  }
}

impl AuthUser for User {
  type Id = String;

  fn id(&self) -> Self::Id {
    self.0.id.clone()
  }

  fn session_auth_hash(&self) -> &[u8] {
    self.0.auth_hash.as_bytes()
  }
}

#[derive(Clone)]
pub(crate) struct Backend(pub(crate) SessionData);

impl AuthnBackend for Backend {
  type User = User;
  type Credentials = Identity;
  type Error = std::io::Error;

  async fn authenticate(&self, identity: Identity) -> Result<Option<User>, Self::Error> {
    self
      .0
      .save_identity(&identity)
      .await
      .map_err(|error| std::io::Error::other(Box::<dyn std::error::Error + Send + Sync>::from(error)))?;
    Ok(Some(User(identity)))
  }

  async fn get_user(&self, id: &String) -> Result<Option<User>, Self::Error> {
    self
      .0
      .identity(id)
      .await
      .map(|identity| identity.map(User))
      .map_err(|error| std::io::Error::other(Box::<dyn std::error::Error + Send + Sync>::from(error)))
  }
}
