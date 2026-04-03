import { authClient } from "./auth-client";

export const useSession = () => {
  return authClient.useSession();
};
