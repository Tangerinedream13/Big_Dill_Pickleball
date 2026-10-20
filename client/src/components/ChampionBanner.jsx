// client/src/components/ChampionBanner.jsx
import { Box, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { Trophy } from "lucide-react";

function divisionName(division) {
  return division === "ADVANCED" ? "Advanced" : "Beginner / Intermediate";
}

function ChampionCard({ division, champion, runnerUp, third }) {
  return (
    <Box
      position="relative"
      overflow="hidden"
      bg="club.900"
      color="cream.50"
      border="1px solid"
      borderColor="gold.500"
      borderRadius="2xl"
      boxShadow="lift"
      px={{ base: 3, md: 5 }}
      py={{ base: 2.5, md: 4 }}
    >
      {/* Gold trim along the top edge */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="3px"
        bgGradient="to-r"
        gradientFrom="gold.700"
        gradientVia="gold.200"
        gradientTo="gold.700"
      />

      <HStack gap={{ base: 3, md: 4 }} align="center">
        <Box
          flexShrink={0}
          display="grid"
          placeItems="center"
          boxSize={{ base: "36px", md: "48px" }}
          borderRadius="full"
          bg="gold.500"
          color="club.900"
          border="2px solid"
          borderColor="gold.200"
        >
          <Trophy size={20} />
        </Box>

        <Stack gap={0.5} minW={0}>
          <Text
            fontSize="xs"
            fontWeight="700"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="gold.200"
          >
            {divisionName(division)} Champions
          </Text>
          <Text
            fontSize={{ base: "md", md: "xl" }}
            fontWeight="800"
            letterSpacing="-0.01em"
            lineHeight="short"
            truncate
          >
            {champion}
          </Text>
          {runnerUp || third ? (
            <Text
              fontSize="sm"
              color="club.100"
              opacity={0.85}
              display={{ base: "none", md: "block" }}
              truncate
            >
              {runnerUp ? `2nd: ${runnerUp}` : null}
              {runnerUp && third ? " · " : null}
              {third ? `3rd: ${third}` : null}
            </Text>
          ) : null}
        </Stack>
      </HStack>
    </Box>
  );
}

/**
 * Champion banner for page headers. Shows one card per division as soon as
 * that division's Final is scored, so each division can be celebrated while
 * the other is still playing.
 */
export default function ChampionBanner({ results, note }) {
  if (!results?.length) return null;

  return (
    <Stack gap={2}>
      <SimpleGrid columns={{ base: 1, md: results.length }} gap={3}>
        {results.map((r) => (
          <ChampionCard key={r.division} {...r} />
        ))}
      </SimpleGrid>
      {note ? (
        <Text fontSize="sm" color="fg.muted" textAlign="right">
          {note}
        </Text>
      ) : null}
    </Stack>
  );
}
