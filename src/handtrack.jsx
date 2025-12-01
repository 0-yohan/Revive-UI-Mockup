import React from "react";
// import HandTrackingScene from "./components/HandTrackingScene";
import HandTrackingScene from "./components/tracking";
// import HandTrackingScene from "./components/debug";

export default function TrackingPage() {
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#071024" }}>
      <h1 style={{ color: "white", padding: "10px" }}>
        
      </h1>
      <HandTrackingScene />
    </div>
  );
}
