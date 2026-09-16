"use client";

import Box from "@mui/material/Box";
import { ResponsiveFunnel } from "@nivo/funnel";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";

// Split into its own module (rather than living in Panels.tsx with the rest)
// so @nivo/funnel only loads when a problem is actually drilled into, not on
// every analytics page load — this is the only chart that needs it.
/** Nested stages: in scope → attempted → solved. */
export default function FunnelChart({ stages }: { stages: { stage: string; value: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveFunnel
        data={stages.map((s) => ({ id: s.stage, value: s.value, label: `${s.stage} (${s.value})` }))}
        margin={{ top: 16, right: 24, bottom: 16, left: 24 }}
        theme={theme}
        colors={[colors[0], colors[1], colors[2]]}
        borderWidth={0}
        labelColor={{ from: "color", modifiers: [["darker", 3]] }}
        beforeSeparatorLength={0}
        afterSeparatorLength={0}
        currentPartSizeExtension={8}
      />
    </Box>
  );
}
