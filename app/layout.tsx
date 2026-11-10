import type { Metadata } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Outfit, Pinyon_Script } from "next/font/google";
import { Envelope } from "@/components/envelope";
import { Header } from "@/components/header";
import { Intro } from "@/components/intro";
import { ScrollGround } from "@/components/scroll-ground";
import { readSession } from "@/lib/auth";
import { getHome } from "@/lib/db";
import { MARK } from "@/lib/mark";
import { DEFAULT_BACKGROUND_OPACITY, DEFAULT_PANEL_OPACITY } from "@/lib/live";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const script = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

const ui = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: MARK,
  description: "A private wedding memory for Ying & kel. April 9, 2027, Reno, Nevada.",
};

const boot = `try{var r=document.documentElement;r.classList.add("js");if(matchMedia("(prefers-reduced-motion: reduce)").matches)r.classList.add("reduce-motion");var q=new URLSearchParams(location.search);var token=q.get("guest")||"";var party=[];var dot=token.indexOf(".");if(dot>0){try{var b=token.slice(0,dot).replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";var json=JSON.parse(atob(b));if(json&&Array.isArray(json.party)){for(var i=0;i<json.party.length&&party.length<2;i++){if(typeof json.party[i]==="string"){var bit=json.party[i].replace(/\\s+/g," ").trim();if(bit)party.push(bit.slice(0,60))}}}if(!party.length&&json&&typeof json.name==="string"){var only=json.name.replace(/\\s+/g," ").trim();if(only)party.push(only.slice(0,60))}}catch(err){}}function lastWord(s){var w=s.split(" ");return w[w.length-1]||s}function firstWord(s){return s.split(" ")[0]||s}if(party.length===1){r.dataset.family=lastWord(party[0])+" Family";r.dataset.invite=party[0]}else if(party.length===2){var la=lastWord(party[0]);var lb=lastWord(party[1]);r.dataset.family=(la.toLowerCase()===lb.toLowerCase()?la:la+" and "+lb)+" Family";r.dataset.invite=firstWord(party[0])+" and "+firstWord(party[1])}var key="yk-intro:"+(token||"home");var seen=false;try{seen=sessionStorage.getItem(key)==="1"}catch(err){}if(seen||location.pathname==="/camera"){r.classList.add("intro-done");r.classList.add("envelope-open")}else{r.classList.add("envelope-lock")}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let backgroundOpacity = DEFAULT_BACKGROUND_OPACITY;
  let panelOpacity = DEFAULT_PANEL_OPACITY;
  let owner = false;
  try {
    const home = await getHome();
    backgroundOpacity = home.backgroundOpacity;
    panelOpacity = home.panelOpacity;
  } catch {
    backgroundOpacity = DEFAULT_BACKGROUND_OPACITY;
    panelOpacity = DEFAULT_PANEL_OPACITY;
  }
  try {
    owner = Boolean(await readSession());
  } catch {
    owner = false;
  }
  return (
    <html
      lang="en"
      className={`${serif.variable} ${script.variable} ${ui.variable}`}
      style={{
        ["--bg-video" as string]: String(backgroundOpacity / 100),
        ["--panel" as string]: String(panelOpacity / 100),
      }}
    >
      <body className={serif.className}>
        <Script id="boot" strategy="beforeInteractive">
          {boot}
        </Script>
        <ScrollGround />
        <Envelope />
        <Intro />
        <Header owner={owner} />
        {children}
      </body>
    </html>
  );
}
