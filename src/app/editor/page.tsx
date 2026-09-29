import Editor from "@/components/editor-shell";
import { pageMetadata } from "@/lib/seo";

// Sayfa başlıkları statik export'ta tek dilli kalıyor; kök layout ve /agent
// İngilizce olduğu için burası da İngilizce — üç sayfa arasında dil karışmasın.
export const metadata = pageMetadata({
  path: "/editor/",
  title: "Nibble | editor",
  description: "Draw pixel art and animation in your browser. No account, no server, free.",
});

export default function EditorPage() {
  return <Editor />;
}
