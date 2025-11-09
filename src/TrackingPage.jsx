/* eslint-disable no-unused-vars */
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
} from "lucide-react";
import "./TrackingPage.css";

const EXERCISES = [
  {
    id: 1,
    name: "Knee Extension",
    video:
      "knee.gif",
  },
  {
    id: 2,
    name: "Step-up (Low Platform)",
    video:
      "step-up.gif",
  },
];

export default function TrackingPage() {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [detected, setDetected] = useState(true);
  const [dark, setDark] = useState(false);
  const [sets] = useState({ current: 1, total: 3 });
  const [reps] = useState({ current: 10, total: 15 });
  const [quality] = useState(8);
  const [progress, setProgress] = useState(40);

  const vidRef = useRef(null);

  useEffect(() => {
  // Initialize timer
  let timer;
  if (playing) {
    timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }
  return () => clearInterval(timer);
}, [playing]);

 useEffect(() => {
  // Initialize camera 
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      if (vidRef.current) {
        vidRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }

  initCamera();

  
  return () => {
    if (vidRef.current && vidRef.current.srcObject) {
      vidRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
  };
}, []); 


  const timeStr = useMemo(() => {
    const m = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [elapsed]);

  const exercise = EXERCISES[exerciseIndex];

  return (
    <div className={`tracking-page ${dark ? "dark" : ""}`}>
      {/* HEADER */}
      <header className="header">
        <button
          className="toggle-btn"
          onClick={() => setDark((d) => !d)}
          title="Toggle theme"
        ></button>

        <div className="header-center">
          <span className="pill">{timeStr}</span>
          <button
            className="pause-btn"
            onClick={() => setPlaying((p) => !p)}
            title="Play/Pause"
          >
            {playing ? <Pause size={24} /> : <Play size={24} />}
          </button>
        </div>

        <button className="end-btn">End</button>
      </header>

      {/* PROGRESS BAR */}
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{ width: `${progress}%` }}
        ></div>
        <div
          className="progress-dot"
          style={{ left: `${progress}%` }}
        ></div>
      </div>

      {/* MAIN GRID */}
      <main className="main-grid">
        {/* LEFT PANEL */}
        <section className="left-panel">
          <div className="stat-card">
            <p style={{marginTop:"-20px"}}>Set count</p>
            <h3>{`0${sets.current}/0${sets.total}`}</h3>
          </div>
          <div className="stat-card">
            <p style={{marginTop:"-20px"}}>Rep count</p>
            <h3>{`${reps.current}/${reps.total}`}</h3>
          </div>
          <div className="stat-card">
            <p style={{marginTop:"-10px"}}>Rep Quality</p>
            <div className="rep-quality">
              <div
                className={`quality-orb ${
                  quality >= 8 ? "high" : quality >= 5 ? "medium" : "low"
                }`}
              >
                {quality}/10
              </div>
              
            </div>
          </div>
        </section>

        {/* CENTER VIDEO */}
        <section className="video-section">
          <div
            className={`video-container ${
              detected ? "glow-green" : "glow-red"
            }`}
          >
            <video
              ref={vidRef}
              src={exercise.video}
              className="main-video"
              autoPlay
              muted
              loop
              playsInline
            ></video>
          </div>

          {/* AI Feedback*/}
          <div className="feedback-section">
           

            <div className="ai-feedback">
              {detected
                ? "Nice! Keep your knee aligned over your toes. Hold for 2sec..."
                : "Step into frame or face the camera so we can track your movement."}
            </div>

            
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section className="right-panel">
          <div className="tutorial-card">
            <div>
              <h3>{exercise.name}</h3>
              <img
                src={exercise.video}
                className="tutorial-video"
                autoPlay
                muted
                loop
                playsInline
              />
              {/* <p className="description">
                Maintain upright posture, control range, and avoid locking the knee at the top.
              </p> */}
            </div>
            <div className="tutorial-footer">
              <button
                className="icon-btn"
                onClick={() =>
                  setExerciseIndex(
                    (i) => (i - 1 + EXERCISES.length) % EXERCISES.length
                  )
                }
              >
                <ChevronLeft size={40} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setExerciseIndex((i) => (i + 1) % EXERCISES.length)}
              >
                <ChevronRight size={40} />
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
