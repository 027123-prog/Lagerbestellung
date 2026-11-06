import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return (
    <iframe
      src="/legacy.html"
      title="Lagerbestellung"
      style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
    />
  );
}

