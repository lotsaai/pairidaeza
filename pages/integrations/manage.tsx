// "Your apps": connected apps, installed plugins, MCP servers, and custom tool sources.
import { TextButton } from "../../components/ui";
import { apps, connectorPlugins, isConnected, needsSignIn, removeSource, servers, signIn, type Source, sources } from "./catalog";
import { AppTile, Cell, ConnectionStatus, confirmRemove, Grid, Row } from "./parts";
import { go } from "./route";

const kindLabel = { api: "OpenAPI", graphql: "GraphQL", mcp: "MCP" } as const;

function SourceRow(props: { source: Source }) {
  return (
    <Row name={props.source.name} detail={`${kindLabel[props.source.kind]} ${props.source.url}`}>
      <TextButton
        variant="secondary"
        label="Remove"
        accessibilityLabel={`Remove ${props.source.name}`}
        onPress={() => void confirmRemove(props.source.name).then((yes) => yes && removeSource(props.source.id))}
      />
    </Row>
  );
}

export function Manage() {
  return (
    <Grid>
      <Each of={apps().filter((a) => isConnected(a.id))} key={(a) => a.id}>
        {(app) => (
          <Cell>
            <AppTile app={app()} />
          </Cell>
        )}
      </Each>
      <Each of={connectorPlugins()} key={(p) => p.source}>
        {(plugin) => (
          <Cell>
            <Row
              name={plugin().displayName}
              detail={plugin().servers.length === 1 ? "1 connector" : `${plugin().servers.length} connectors`}
              status={<ConnectionStatus state={needsSignIn(plugin()) ? "needs-sign-in" : "connected"} />}
              openLabel={`Open ${plugin().displayName}`}
              onOpen={() => go({ name: "plugin", source: plugin().source })}
            >
              <If when={needsSignIn(plugin())}>
                <TextButton
                  variant="secondary"
                  label="Sign in"
                  accessibilityLabel={`Sign in ${plugin().displayName}`}
                  onPress={() => plugin().servers.forEach((s) => signIn(plugin().source, s.name))}
                />
              </If>
            </Row>
          </Cell>
        )}
      </Each>
      <Each of={servers()} key={(s) => s.id}>
        {(server) => (
          <Cell>
            <Row name={server().name} status={<ConnectionStatus state="connected" />} />
          </Cell>
        )}
      </Each>
      <Each of={sources()} key={(s) => s.id}>
        {(source) => (
          <Cell>
            <SourceRow source={source()} />
          </Cell>
        )}
      </Each>
    </Grid>
  );
}
