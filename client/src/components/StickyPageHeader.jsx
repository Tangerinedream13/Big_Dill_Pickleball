// client/src/components/StickyPageHeader.jsx
import { Box, Container } from "@chakra-ui/react";

export default function StickyPageHeader({ children }) {
  // Force opaque cream (no blur, no transparency)
  const stickyStyle = {
    backgroundColor: "var(--chakra-colors-cream-50, #FFF7E6)",
    opacity: 1,
    transform: "translateZ(0)",
    WebkitTransform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
    WebkitBackdropFilter: "none",
    backdropFilter: "none",
  };

  return (
    <Box
      position="sticky"
      top="0"
      zIndex={9999}
      borderBottom="1px solid"
      borderColor="border"
      boxShadow="md"
      isolation="isolate"
      overflow="hidden"
      style={stickyStyle}
    >
      {/* IMPORTANT: Container also must be opaque */}
      <Container maxW="6xl" py={{ base: 4, md: 5 }} style={stickyStyle}>
        {children}
      </Container>
    </Box>
  );
}
