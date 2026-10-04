"use client";
import dynamic from "next/dynamic";
import { LoadingScreen } from "./Screens";

// The app talks to IndexedDB, Web Workers and the DOM, so it renders on the client only.
const App = dynamic(() => import("./App"), { ssr: false, loading: () => <LoadingScreen /> });

export default function Boot() { return <App />; }
