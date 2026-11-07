import { AppShell, Group, Stack, Text, Title } from "@mantine/core";
import { RepoExplorer } from "./components/RepoExplorer";

const ACCENT = "#c8f060";

function App() {
  return (
    <AppShell
      padding="sm"
      header={{ height: 68 }}
      styles={{
        main: { background: "#0f0f0f", color: "#e8e8e8", minHeight: "100vh" },
        header: { background: "#161616", borderColor: "#2a2a2a" },
      }}
    >
      <AppShell.Header>
        <Group px="md" py="sm" justify="space-between">
          <Stack gap={0}>
            <Title order={3} c={ACCENT} ff="Fraunces, serif">
              Structra
            </Title>
            <Text size="xs" c="dimmed" fs="italic">
              repo tree visualizer
            </Text>
          </Stack>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <RepoExplorer />
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
