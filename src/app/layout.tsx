import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const ui = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-ui" });
export const metadata: Metadata = { title: "Autogaraż", description: "Wszystko o Twoich samochodach w jednym miejscu." };
export const viewport: Viewport = { colorScheme: "light dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pl" className={ui.variable}><body>{children}</body></html>;
}
