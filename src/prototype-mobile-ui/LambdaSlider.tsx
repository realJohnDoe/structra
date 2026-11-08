// PROTOTYPE (throwaway): the Balance λ slider, shared so variants differ in layout, not in slider wiring.
import { Group, Slider, Text } from "@mantine/core";
import { ACCENT, lambdaSummary } from "./shared";
import type { ProtoState } from "./shared";

export function LambdaSlider({ s, showSummary = true }: { s: ProtoState; showSummary?: boolean }) {
  return (
    <div style={{ width: "100%" }}>
      <Group justify="space-between" gap={4} mb={4} wrap="nowrap">
        <Text size="xs" c="dimmed">
          flat
        </Text>
        <Text size="xs" c={ACCENT} fw={600}>
          Balance λ = {s.lambda.toFixed(2)}
        </Text>
        <Text size="xs" c="dimmed">
          deep
        </Text>
      </Group>
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={s.lambda}
        onChange={s.setLambda}
        onChangeEnd={s.commitLambda}
        label={null}
        color="lime"
        size="lg"
        thumbSize={26}
        styles={{ thumb: { borderWidth: 3 } }}
      />
      {showSummary && (
        <Text size="xs" c="dimmed" ta="center" mt={4}>
          {s.large && s.tree && Math.abs(s.tree.lambda - s.lambda) > 0.001 ? "release to update · " : ""}
          {lambdaSummary(s)}
        </Text>
      )}
    </div>
  );
}
