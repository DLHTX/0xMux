#[cfg(feature = "embed-frontend")]
mod embedded {
    use axum::{
        http::{StatusCode, Uri, header},
        response::{IntoResponse, Response},
    };
    use rust_embed::Embed;

    #[derive(Embed)]
    #[folder = "../web/dist/"]
    #[exclude = "*.map"]
    struct Assets;

    pub async fn serve_embedded(uri: Uri) -> Response {
        let path = uri.path().trim_start_matches('/');
        let path = if path.is_empty() { "index.html" } else { path };

        match Assets::get(path) {
            Some(content) => {
                let mime = mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .to_string();
                (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, mime)],
                    content.data.to_vec(),
                )
                    .into_response()
            }
            None => {
                // SPA fallback: serve index.html for non-file routes
                match Assets::get("index.html") {
                    Some(content) => (
                        StatusCode::OK,
                        [(header::CONTENT_TYPE, "text/html".to_string())],
                        content.data.to_vec(),
                    )
                        .into_response(),
                    None => StatusCode::NOT_FOUND.into_response(),
                }
            }
        }
    }
}

#[cfg(feature = "embed-frontend")]
pub use embedded::serve_embedded;
