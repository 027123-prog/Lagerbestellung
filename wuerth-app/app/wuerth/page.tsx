import { requireChatGPTUser } from "../chatgpt-auth";
import Bestellhilfe from "../Bestellhilfe";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Würth" };
export default async function Wuerth() {
  await requireChatGPTUser("/wuerth");
  return <Bestellhilfe />;
}
