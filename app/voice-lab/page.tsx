import { requireChatGPTUser } from "../chatgpt-auth";
import VoiceLab from "./VoiceLab";

export default async function VoiceLabPage() {
  await requireChatGPTUser("/voice-lab");
  return <VoiceLab />;
}
