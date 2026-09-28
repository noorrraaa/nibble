import Editor from "@/components/editor-shell";

// Sayfa başlıkları statik export'ta tek dilli kalıyor; kök layout ve /agent
// İngilizce olduğu için burası da İngilizce — üç sayfa arasında dil karışmasın.
export const metadata = {
  title: "Nibble | editor",
  description: "Draw pixel art and animation in your browser. No account, no server, free.",
};

export default function EditorPage() {
  return <Editor />;
}
