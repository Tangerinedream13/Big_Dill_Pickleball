import { IconButton } from "@chakra-ui/react";
import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function HomeButton(props) {
  const navigate = useNavigate();

  return (
    <IconButton
      aria-label="Home"
      variant="outline"
      onClick={() => navigate("/")}
      position="absolute"
      top={{ base: 4, md: 6 }}
      left={{ base: 4, md: 6 }}
      zIndex={20}
      {...props}
    >
      <Home size={18} />
    </IconButton>
  );
}