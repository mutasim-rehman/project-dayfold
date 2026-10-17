import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Dayfold — Your daily perspective",description:"A thoughtful daily paper, shaped by your interests. Read, explore, and stay curious."};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
