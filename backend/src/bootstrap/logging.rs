use init_tracing_opentelemetry::Error as TraceError;
use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::{self, Tracer};
use tracing::Subscriber;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{
    EnvFilter, Layer, layer::SubscriberExt, registry::LookupSpan, util::SubscriberInitExt,
};

#[must_use = "Recommend holding with 'let _guard = ' pattern to ensure final traces are sent to the server"]
pub struct TracingGuard {
    tracerprovider: trace::SdkTracerProvider,
}

impl Drop for TracingGuard {
    fn drop(&mut self) {
        let _ = self.tracerprovider.force_flush();
    }
}

pub fn init() -> eyre::Result<TracingGuard> {
    let (layer, guard) = build_otel_layer()?;
    let registry = tracing_subscriber::registry()
        .with(layer)
        .with(build_loglevel_filter_layer("info"))
        .with(build_logger_text());

    registry.init();

    Ok(guard)
}

pub fn build_otel_layer<S>() -> Result<(OpenTelemetryLayer<S, Tracer>, TracingGuard), TraceError>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    use init_tracing_opentelemetry::{otlp, resource::DetectResource};
    use opentelemetry::global;
    let otel_rsrc = DetectResource::default()
        .with_fallback_service_name(env!("CARGO_PKG_NAME"))
        .with_fallback_service_version(env!("CARGO_PKG_VERSION"))
        .build();
    let tracerprovider = otlp::traces::init_tracerprovider(otel_rsrc, otlp::traces::identity)?;
    init_tracing_opentelemetry::init_propagator()?;
    let layer = tracing_opentelemetry::layer()
        .with_error_records_to_exceptions(true)
        .with_tracer(tracerprovider.tracer(""));
    global::set_tracer_provider(tracerprovider.clone());
    Ok((layer, TracingGuard { tracerprovider }))
}

pub fn build_logger_text<S>() -> Box<dyn Layer<S> + Send + Sync + 'static>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    Box::new(
        tracing_subscriber::fmt::layer()
            .json()
            .with_timer(tracing_subscriber::fmt::time::uptime()),
    )
}

pub fn build_loglevel_filter_layer<S: Into<String>>(default_log: S) -> EnvFilter {
    let filter = std::env::var("PAIRIDAEZA_LOG")
        .or_else(|_| std::env::var("RUST_LOG"))
        .unwrap_or_else(|_| default_log.into());
    EnvFilter::try_new(format!("{filter},otel::tracing=trace,otel::setup=debug"))
        .unwrap_or_else(|_| EnvFilter::new("info"))
}
