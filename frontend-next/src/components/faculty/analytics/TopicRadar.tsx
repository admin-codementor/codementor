"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ResponsiveRadar } from "@nivo/radar";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";

// Split into its own module (rather than living in Panels.tsx with the rest)
// so @nivo/radar only loads when a cohort is actually drilled into, not on
// every analytics page load — this is the only chart that needs it.
export default function TopicRadar({ topics }: { topics: { topic: string; accuracy: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  if (topics.length < 3) {
    return <Typography variant="body2" color="text.secondary">Needs at least three topics with activity.</Typography>;
  }
  return (
    <Box sx={{ height: 300 }}>
      <ResponsiveRadar
        data={topics.map((t) => ({ topic: t.topic, accuracy: t.accuracy }))}
        keys={["accuracy"]}
        indexBy="topic"
        maxValue={100}
        margin={{ top: 40, right: 60, bottom: 30, left: 60 }}
        theme={theme}
        colors={[colors[2]]}
        fillOpacity={0.2}
        borderWidth={2}
        gridLabelOffset={12}
        dotSize={6}
      />
    </Box>
  );
}
