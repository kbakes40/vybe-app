// Install the better-auth OnlineManager stub BEFORE anything else imports
// @better-auth/expo. See src/lib/auth/install-online-manager-stub.ts for why.
import "./src/lib/auth/install-online-manager-stub";
import "react-native-get-random-values";
import "react-native-reanimated";
import { LogBox } from "react-native";
import "./global.css";
import "expo-router/entry";
LogBox.ignoreLogs(["Expo AV has been deprecated", "Disconnected from Metro"]);
