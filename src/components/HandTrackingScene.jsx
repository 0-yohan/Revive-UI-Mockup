/* HandTrackingScene.jsx — Pose-based arm tracking (JSX/Vite) */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Pose } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";

/*
  Notes:
  - Uses MediaPipe Pose landmarks: 11/12 shoulders, 13/14 elbows, 15/16 wrists
  - Uses DEF- bones from your ybot rig (DEF-upper_armL, DEF-forearmL, DEF-handL, ...)
  - Applies smoothed pitch/yaw to upper arm and elbow bend to forearm (clamped)
  - Keeps model fixed in place and scales/centers on load.
*/

export default function HandTrackingScene() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  const [status, setStatus] = useState("Initializing...");
  const boneMapRef = useRef({});
  const smoothingRef = useRef({
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
  });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !videoRef.current) return;

    let scene, camera, renderer;
    let humanoid = null;
    let animationId = 0;

    // helper util: clamp
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // initialize three scene
    function initThree() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x071024);

      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;

      camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      camera.position.set(0, 1.6, 3);

      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        alpha: true,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);

      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const d = new THREE.DirectionalLight(0xffffff, 0.6);
      d.position.set(5, 10, 5);
      scene.add(d);

      // load model
      const loader = new GLTFLoader();
      loader.load(
        "/models/ybot.glb",
        (gltf) => {
          humanoid = gltf.scene;

          // scale + center model to fit the scene neatly
          const box = new THREE.Box3().setFromObject(humanoid);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const desired = 1.6; // desired size scale factor (tune if needed)
          const scale = desired / maxDim;
          humanoid.scale.setScalar(scale);

          // center on origin
          box.setFromObject(humanoid);
          const center = new THREE.Vector3();
          box.getCenter(center);
          humanoid.position.sub(center);
          // move slightly down so feet sit at -1
          humanoid.position.y -= -1.2;

          scene.add(humanoid);

          // map rig bones (DEF- deform bones)
          boneMapRef.current = mapYBotBones(humanoid);
          console.log("Mapped bones:", boneMapRef.current);

          setStatus("Model loaded. Waiting for pose...");
        },
        undefined,
        (err) => {
          console.error("GLTF load error:", err);
          setStatus("Model load failed (console).");
        }
      );

      window.addEventListener("resize", onWindowResize);
    }

    function onWindowResize() {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    function mapYBotBones(root) {
      const find = (name) => root.getObjectByName(name) || null;
      return {
        leftShoulder: find("DEF-shoulderL"),
        leftUpperArm: find("DEF-upper_armL"),
        leftForearm: find("DEF-forearmL"),
        leftHand: find("DEF-handL"),
        rightShoulder: find("DEF-shoulderR"),
        rightUpperArm: find("DEF-upper_armR"),
        rightForearm: find("DEF-forearmR"),
        rightHand: find("DEF-handR"),
      };
    }

    // utility: apply smoothed slerp to world quaternion (safer than directly setting Euler)
    function slerpTo(obj, targetQuat, t) {
      if (!obj) return;
      const q = obj.quaternion.clone();
      q.slerp(targetQuat, t);
      obj.quaternion.copy(q);
    }

    // Build target quaternion from yaw/pitch/roll (in model-local space assumption)
    function eulerToQuaternion(pitch, yaw, roll = 0) {
      // order YXZ — yaw (Y), pitch (X), roll (Z) similar to earlier code
      const e = new THREE.Euler(pitch, yaw, roll, "YXZ");
      return new THREE.Quaternion().setFromEuler(e);
    }

    // MAIN: Pose init
    function initPose() {
      const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults(onPoseResults);

      if (videoRef.current) {
        const cam = new Camera(videoRef.current, {
          onFrame: async () => {
            await pose.send({ image: videoRef.current });
          },
          width: 640,
          height: 480,
        });
        cam.start();
      }
    }

    // Convert mediapipe normalized coords (x,y,z) to a simple camera-space vector
    // This is approximate but works well for rotational calculations.
    function mpToVec(land) {
      // Map x [-0.5..0.5] -> world x, y [0..1] -> world y
      // scale factor for depth and width : tune to match model proportions
      const SCALE = 1.5; // overall scaling for mapping to model space
      const x = (land.x - 0.5) * SCALE;
      const y = (0.5 - land.y) * SCALE; // invert y (mediapipe y: top=0)
      const z = -land.z * SCALE; // mediapipe z is negative when forward; invert so positive forward
      return new THREE.Vector3(x, y, z);
    }

    // Pose results handler
    function onPoseResults(results) {
      if (!boneMapRef.current || Object.keys(boneMapRef.current).length === 0) {
        setStatus("Model not ready");
        return;
      }
      if (!results.poseLandmarks) {
        setStatus("No pose");
        return;
      }

      setStatus("Pose detected");

      // landmark indices
      const L_SHOULDER = 11;
      const R_SHOULDER = 12;
      const L_ELBOW = 13;
      const R_ELBOW = 14;
      const L_WRIST = 15;
      const R_WRIST = 16;

      const lm = results.poseLandmarks;
      // convert to vecs
      const lShoulder = mpToVec(lm[L_SHOULDER]);
      const rShoulder = mpToVec(lm[R_SHOULDER]);
      const lElbow = mpToVec(lm[L_ELBOW]);
      const rElbow = mpToVec(lm[R_ELBOW]);
      const lWrist = mpToVec(lm[L_WRIST]);
      const rWrist = mpToVec(lm[R_WRIST]);

      // compute side vectors: shoulder -> elbow, elbow -> wrist
      const lUpperVec = new THREE.Vector3().subVectors(lElbow, lShoulder); // direction of upper arm (left)
      const lForeVec = new THREE.Vector3().subVectors(lWrist, lElbow); // direction of forearm (left)

      const rUpperVec = new THREE.Vector3().subVectors(rElbow, rShoulder);
      const rForeVec = new THREE.Vector3().subVectors(rWrist, rElbow);

      // compute simple angles: pitch from vertical (y), yaw from x axis
      // tune these scales to make motion natural
      const PITCH_SCALE = 1.6;
      const YAW_SCALE = 1.6;

      // left side: positive pitch = arm up, positive yaw = arm right in camera space
      const lPitch = clamp(-lUpperVec.y * PITCH_SCALE, -1.3, 1.3); // invert sign so up -> positive
      const lYaw = clamp(lUpperVec.x * YAW_SCALE, -1.3, 1.3);

      // forearm bend estimate: how much forearm folds relative to upper arm
      // compute angle between upperVec and foreVec
      const lElbowAngle = clamp(lUpperVec.angleTo(lForeVec) - 0.2, 0, 2.0); // subtract small offset

      // right side (mirror yaw)
      const rPitch = clamp(-rUpperVec.y * PITCH_SCALE, -1.3, 1.3);
      const rYaw = clamp(rUpperVec.x * YAW_SCALE, -1.3, 1.3);
      const rElbowAngle = clamp(rUpperVec.angleTo(rForeVec) - 0.2, 0, 2.0);

      // smoothing
      const sl = smoothingRef.current.left;
      const sr = smoothingRef.current.right;
      sl.x = THREE.MathUtils.lerp(sl.x, lYaw, 0.18);
      sl.y = THREE.MathUtils.lerp(sl.y, lPitch, 0.18);
      sr.x = THREE.MathUtils.lerp(sr.x, rYaw, 0.18);
      sr.y = THREE.MathUtils.lerp(sr.y, rPitch, 0.18);

      const bm = boneMapRef.current;

      // build target quaternions (we assume local axes such that
      // Euler (pitch, yaw, roll) using order YXZ gives sensible rotation).
      // Adjust signs if you notice mirrored/backwards motion.
      const leftTargetQ = eulerToQuaternion(sl.y, sl.x, 0);
      const rightTargetQ = eulerToQuaternion(sr.y, -sr.x, 0); // mirror yaw for right side

      // Apply rotations smoothly to upper arms and hands. Use slerp for natural motion.
      if (bm.leftUpperArm) slerpTo(bm.leftUpperArm, leftTargetQ, 0.25);
      if (bm.rightUpperArm) slerpTo(bm.rightUpperArm, rightTargetQ, 0.25);

      // Forearm: apply elbow bend around local X (approx). Build quaternion from elbow flex.
      // We'll rotate forearm in local X by a positive angle (so it bends forward, not backward).
      if (bm.leftForearm) {
        const foreQ = eulerToQuaternion(lElbowAngle * 0.8, 0, 0);
        slerpTo(bm.leftForearm, foreQ, 0.2);
      }
      if (bm.rightForearm) {
        const foreQ = eulerToQuaternion(rElbowAngle * 0.8, 0, 0);
        slerpTo(bm.rightForearm, foreQ, 0.2);
      }

      // subtle hand rotations to follow forearm direction
      if (bm.leftHand) {
        // small pitch/roll from forearm orientation
        const handQ = eulerToQuaternion(sl.y * 0.4, sl.x * 0.4, 0);
        slerpTo(bm.leftHand, handQ, 0.18);
      }
      if (bm.rightHand) {
        const handQ = eulerToQuaternion(sr.y * 0.4, -sr.x * 0.4, 0);
        slerpTo(bm.rightHand, handQ, 0.18);
      }
    } // end onPoseResults

    // animation loop
    function animate() {
      renderer && scene && camera && renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }

    // cleanup
    function cleanup() {
      cancelAnimationFrame(animationId);
      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const s = videoRef.current.srcObject;
          s.getTracks && s.getTracks().forEach((t) => t.stop());
          videoRef.current.srcObject = null;
        }
      } catch (error) {
        console.log(error)
        /* noop */
      }
      window.removeEventListener("resize", onWindowResize);
    }

    // boot
    initThree();
    initPose();
    animate();

    return () => cleanup();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: 600, position: "relative", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          right: 10,
          top: 10,
          width: 200,
          borderRadius: 8,
          border: "1px solid #555",
          zIndex: 20,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 10,
          top: 10,
          padding: 10,
          color: "white",
          background: "rgba(0,0,0,0.4)",
          borderRadius: 8,
          zIndex: 20,
        }}
      >
        {status}
      </div>
    </div>
  );
}
