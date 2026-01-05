import { Outlet, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Container,
  Flex,
  HStack,
  Link,
  Text,
  Button,
  Badge,
} from "@chakra-ui/react";

export default function AppShell() {
  return (
    <Box minH="100vh" bg="bg.canvas" color="fg.default">
      {/* Top Nav */}
      <Box
        position="sticky"
        top="0"
        zIndex="10"
        bg="white"
        borderBottom="1px solid"
        borderColor="border.DEFAULT"
      >
        <Container maxW="6xl" py={3}>
          <Flex align="center" justify="space-between" gap={3}>
            <HStack gap={3}>
              <Box
                w="10px"
                h="10px"
                borderRadius="full"
                bg="highlight"
                boxShadow="soft"
              />
              <Text fontWeight="700" letterSpacing="-0.02em">
                Big Dill Pickleball
              </Text>
              <Badge variant="pickle">club mode</Badge>
            </HStack>

            <HStack gap={2} wrap="wrap" justify="flex-end">
              <Link as={RouterLink} to="/" px={2} py={1} borderRadius="pill" _hover={{ bg: "club.100" }}>
                Home
              </Link>
              <Link as={RouterLink} to="/players" px={2} py={1} borderRadius="pill" _hover={{ bg: "club.100" }}>
                Players
              </Link>
              <Link as={RouterLink} to="/tournaments/new" px={2} py={1} borderRadius="pill" _hover={{ bg: "club.100" }}>
                Create Tournament
              </Link>
              <Link as={RouterLink} to="/matches" px={2} py={1} borderRadius="pill" _hover={{ bg: "club.100" }}>
                Matches
              </Link>
              <Link as={RouterLink} to="/bracket" px={2} py={1} borderRadius="pill" _hover={{ bg: "club.100" }}>
                Bracket
              </Link>

              <Button variant="pickle" size="sm" as={RouterLink} to="/tournaments/new">
                New Tournament
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Page content */}
      <Container maxW="6xl" py={{ base: 6, md: 10 }}>
        <Outlet />
      </Container>
    </Box>
  );
}