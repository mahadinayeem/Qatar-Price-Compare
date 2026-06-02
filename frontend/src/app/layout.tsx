import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qatar Price Compare | Rawabi · Family · Lulu",
  description:
    "Compare live fruit & vegetable prices across Qatar's top hypermarkets — Rawabi, Family Food Centre, and Lulu Hypermarket. Updated automatically every 6 hours.",
  keywords: ["Qatar prices", "Rawabi", "Lulu Hypermarket", "Family Food Centre", "grocery prices Qatar", "fruit vegetable prices Qatar"],
  openGraph: {
    title: "Qatar Price Compare",
    description: "Live price comparison for fruits & vegetables across Qatar supermarkets.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakartaSans.variable}>
      <body className={`${jakartaSans.className} antialiased`}>{children}</body>
    </html>
  );
}
