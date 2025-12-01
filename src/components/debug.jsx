import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Holistic } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";

export default function HandTrackingScene() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const sceneRef = useRef();
  const rendererRef = useRef();
  const cameraRef = useRef();
  const controlsRef = useRef();
  const bonesRef = useRef({});
  const [status, setStatus] = useState("Loading model…");

  useEffect(() => {
    if (!canvasRef.current) return;

    //-------------------------------------------------------
    //  THREE.JS SETUP
    //-------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071024);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      45,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 5);
    scene.add(dl);

    //-------------------------------------------------------
    //  MODEL LOAD + DEF BONE MAPPING
    //-------------------------------------------------------
    const loader = new GLTFLoader();
    loader.load(
      "/models/ybot.glb",
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.01, 0.01, 0.01);
        model.position.set(0, -1, 0);
        scene.add(model);

        const findBone = (name) => {
          let found = null;
          model.traverse((c) => {
            if (c.isBone && c.name === name) found = c;
          });
          return found;
        };

        const bones = {
          leftShoulder: findBone("DEF-shoulderL") || findBone("shoulderL_1"),
          leftUpperArm: findBone("DEF-upper_armL") || findBone("upper_armL"),
          leftForearm: findBone("DEF-forearmL") || findBone("forearmL"),
          leftHand: findBone("DEF-handL") || findBone("handL"),

          rightShoulder: findBone("DEF-shoulderR") || findBone("shoulderR_1"),
          rightUpperArm: findBone("DEF-upper_armR") || findBone("upper_armR"),
          rightForearm: findBone("DEF-forearmR") || findBone("forearmR"),
          rightHand: findBone("DEF-handR") || findBone("handR"),

          spine: findBone("DEF-spine") || findBone("spine"),
          chest: findBone("DEF-chest") || findBone("chest"),
          neck: findBone("DEF-neck") || findBone("neck"),
          head: findBone("DEF-head") || findBone("head"),
        };

        bonesRef.current = bones;

        setStatus("Model loaded ✓ Starting camera…");
        startMediaPipe();
      },
      undefined,
      (e) => {
        console.error("Model load error:", e);
        setStatus("Model failed to load.");
      }
    );

    //-------------------------------------------------------
    //   NORMALIZER (MP → 3D)
    //-------------------------------------------------------
    const normalize = (l) =>
      new THREE.Vector3(
        (l.x - 0.5) * 2 * -1, // mirror X
        (0.5 - l.y) * 2,      // invert Y
        -l.z * 2              // depth fix
      );

    //-------------------------------------------------------
    // APPLY BONE ROTATION IN LOCAL SPACE
    //-------------------------------------------------------
    const applyBoneLookAt = (bone, start, end, damp = 0.25) => {
      if (!bone || !bone.parent) return;

      const dir = new THREE.Vector3().subVectors(end, start).normalize();

      // Fix axes for Blender/YBot rig
      dir.x *= -1;
      dir.y *= -1;

      const obj = new THREE.Object3D();
      obj.position.copy(start);
      obj.lookAt(start.clone().add(dir));

      const worldQ = obj.quaternion.clone();

      const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      parentQ.invert();

      const localQ = worldQ.clone().multiply(parentQ);

      bone.quaternion.slerp(localQ, damp);
    };

    //-------------------------------------------------------
    //   UPDATE ARM
    //-------------------------------------------------------
    const updateArm = (
      shoulderPos,
      elbowPos,
      wristPos,
      shoulderBone,
      upperArmBone,
      forearmBone,
      handBone
    ) => {
      if (!shoulderBone || !upperArmBone || !forearmBone) return;

      applyBoneLookAt(upperArmBone, shoulderPos, elbowPos, 0.22);
      applyBoneLookAt(forearmBone, elbowPos, wristPos, 0.25);

      if (handBone) {
        handBone.quaternion.slerp(forearmBone.quaternion, 0.3);
      }
    };

    //-------------------------------------------------------
    //   MEDIAPIPE START
    //-------------------------------------------------------
    const startMediaPipe = () => {
      const video = videoRef.current;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      const holistic = new Holistic({
        locateFile: (file) => `/mediapipe/holistic/${file}`,
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holistic.onResults((results) => {
        if (!results.poseLandmarks) return;
        const b = bonesRef.current;
        if (!b) return;

        const lm = results.poseLandmarks;

        const L = {
          nose: normalize(lm[0]),
          leftShoulder: normalize(lm[11]),
          rightShoulder: normalize(lm[12]),
          leftElbow: normalize(lm[13]),
          rightElbow: normalize(lm[14]),
          leftWrist: normalize(lm[15]),
          rightWrist: normalize(lm[16]),
          leftHip: normalize(lm[23]),
          rightHip: normalize(lm[24]),
          leftEye: normalize(lm[2]),
          rightEye: normalize(lm[5]),
        };

        //---------------------------------------------------
        //   ARMS
        //---------------------------------------------------
        updateArm(
          L.leftShoulder,
          L.leftElbow,
          L.leftWrist,
          b.leftShoulder,
          b.leftUpperArm,
          b.leftForearm,
          b.leftHand
        );

        updateArm(
          L.rightShoulder,
          L.rightElbow,
          L.rightWrist,
          b.rightShoulder,
          b.rightUpperArm,
          b.rightForearm,
          b.rightHand
        );

        //---------------------------------------------------
        //   HEAD + NECK
        //---------------------------------------------------
        if (b.head && L.nose && L.leftEye && L.rightEye) {
          const eyeCenter = new THREE.Vector3().addVectors(L.leftEye, L.rightEye).multiplyScalar(0.5);

          applyBoneLookAt(b.head, eyeCenter, L.nose, 0.15);
          if (b.neck) applyBoneLookAt(b.neck, eyeCenter, L.nose, 0.1);
        }

        //---------------------------------------------------
        //   SPINE
        //---------------------------------------------------
        if (b.spine) {
          const hips = new THREE.Vector3().addVectors(L.leftHip, L.rightHip).multiplyScalar(0.5);
          const shoulders = new THREE.Vector3().addVectors(L.leftShoulder, L.rightShoulder).multiplyScalar(0.5);

          applyBoneLookAt(b.spine, hips, shoulders, 0.15);
        }

        setStatus("Tracking active ✓");
      });

      const cam = new Camera(video, {
        onFrame: async () => {
          await holistic.send({ image: video });
        },
        width: 640,
        height: 480,
      });

      cam.start();
    };

    //-------------------------------------------------------
    //   ANIMATION LOOP
    //-------------------------------------------------------
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {};
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          right: "10px",
          bottom: "10px",
          width: "200px",
          height: "150px",
          border: "2px solid white",
          borderRadius: "8px",
          zIndex: 200,
        }}
      ></video>

      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          backgroundColor: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "10px",
          borderRadius: "5px",
          zIndex: 100,
          fontFamily: "monospace",
        }}
      >
        {status}
      </div>
    </div>
  );
}
