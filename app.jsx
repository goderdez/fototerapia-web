import React, { useRef, useState } from "react";

// Lámpara de Fototerapia - Single-file React component
// TailwindCSS utility classes assumed (this file expects Tailwind in the build)
// Dependencias sugeridas en proyecto: react, react-dom, tailwindcss

export default function FototerapiaApp() {
  const [imageName, setImageName] = useState(null);
  const [avgColor, setAvgColor] = useState(null);
  const [phototype, setPhototype] = useState(null);
  const [disease, setDisease] = useState("ulcera_superficial");
  const [settings, setSettings] = useState(null);
  const canvasRef = useRef(null);

  // Lista de enfermedades y sus parámetros base (valor inicial, luego ajustamos por fototipo)
  const DISEASES = {
    ulcera_superficial: {
      label: "Úlcera superficial",
      desc: "Cicatrización, inflamación local",
      ledColor: "#FF7F50", // coral (ejemplo)
      intensity: 70,
      ir_minutes: 10,
    },
    acné_leve: {
      label: "Acné leve",
      desc: "Reducir inflamación y bacterias",
      ledColor: "#0000FF", // azul
      intensity: 60,
      ir_minutes: 6,
    },
    dolor_muscular: {
      label: "Dolor muscular / contractura",
      desc: "Mejora circulación y reduce dolor",
      ledColor: "#FF4500", // naranja intenso
      intensity: 80,
      ir_minutes: 12,
    },
    piel_sensible: {
      label: "Piel sensible / enrojecida",
      desc: "Calmar enrojecimiento",
      ledColor: "#00FF7F", // verde claro
      intensity: 40,
      ir_minutes: 5,
    },
  };

  // Heurística simple para aproximar fototipo (I-VI) usando luminosidad y saturación
  function estimatePhototype(r, g, b) {
    // convertir a HSL para saturación y luminance
    const R = r / 255;
    const G = g / 255;
    const B = b / 255;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const L = (max + min) / 2; // luminance 0..1

    // heurística (muy aproximada): piel más clara -> fototipo I-II (L alto); piel oscura -> V-VI (L bajo)
    if (L > 0.75) return "I-II";
    if (L > 0.6) return "III";
    if (L > 0.45) return "IV";
    if (L > 0.3) return "V";
    return "VI";
  }

  function hexFromRGB(r, g, b) {
    const toHex = (v) => {
      const h = Math.round(v).toString(16);
      return h.length === 1 ? "0" + h : h;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  async function handleImageFile(file) {
    if (!file) return;
    setImageName(file.name);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // pintar imagen en canvas (escalada) y muestrear centro
    const w = 300;
    const h = Math.round((img.height / img.width) * w);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    // muestrear un bloque central (evitar bordes)
    const sx = Math.floor(w * 0.35);
    const sy = Math.floor(h * 0.35);
    const sw = Math.max(20, Math.floor(w * 0.3));
    const sh = Math.max(20, Math.floor(h * 0.3));

    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      r += imgData[i];
      g += imgData[i + 1];
      b += imgData[i + 2];
      count++;
    }
    r = r / count;
    g = g / count;
    b = b / count;
    const hex = hexFromRGB(r, g, b);
    setAvgColor({ r: Math.round(r), g: Math.round(g), b: Math.round(b), hex });
    setPhototype(estimatePhototype(r, g, b));

    // actualizar settings usando heurística
    computeSettings(disease, estimatePhototype(r, g, b));
  }

  function roundMinutes(n) {
    // garantir entero y sin segundos. mínimo 1 minuto si se solicita menos o >0
    const m = Math.max(1, Math.round(n));
    return m;
  }

  function adjustForPhototype(base, phototypeTag) {
    // Ajustes conservadores según fototipo (más oscuro -> menor intensidad de LED y menos IR)
    // Nota: estas son heurísticas de ingeniería, validar clínicamente.
    const map = {
      "I-II": { intensityFactor: 1.0, irFactor: 1.0 },
      III: { intensityFactor: 0.95, irFactor: 0.95 },
      IV: { intensityFactor: 0.9, irFactor: 0.9 },
      V: { intensityFactor: 0.8, irFactor: 0.8 },
      VI: { intensityFactor: 0.75, irFactor: 0.75 },
    };
    const factors = map[phototypeTag] || map.III;
    return {
      ledColor: base.ledColor,
      intensity: Math.round(base.intensity * factors.intensityFactor),
      ir_minutes: roundMinutes(base.ir_minutes * factors.irFactor),
    };
  }

  function computeSettings(diseaseKey, phototypeTag) {
    const base = DISEASES[diseaseKey];
    const adj = adjustForPhototype(base, phototypeTag);
    const payload = {
      disease: diseaseKey,
      disease_label: base.label,
      phototype: phototypeTag,
      led: {
        color: adj.ledColor,
        intensity_pct: adj.intensity,
      },
      infrared: {
        minutes: adj.ir_minutes,
      },
      notes:
        "El tiempo de infrarrojo está en minutos enteros (no segundos). Use la toma inteligente para programar encendido/apagado. Validar clínicamente antes de uso.",
    };
    setSettings(payload);
    return payload;
  }

  function handleDiseaseChange(e) {
    const key = e.target.value;
    setDisease(key);
    computeSettings(key, phototype || "III");
  }

  function downloadJSON() {
    if (!settings) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fototerapia_settings_${settings.disease}_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyToClipboard() {
    if (!settings) return;
    navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
    alert("Ajustes copiados al portapapeles. Péguelos en la app del fabricante o en su sistema domótico.");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold">Lámpara de Fototerapia — Interfaz</h1>
          <p className="mt-2 text-sm text-gray-600">Sube la foto del área a tratar para analizar fototipo y generar ajustes recomendados (IR en minutos, LED color/intensidad).</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-2">
            <label className="block font-medium">1. Subir imagen (zona a tratar)</label>
            <input
              className="mt-2 block w-full text-sm text-gray-700 file:rounded file:px-3 file:py-2 file:border-none file:shadow-sm file:bg-slate-100"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageFile(e.target.files[0])}
            />
            <canvas ref={canvasRef} className="mt-3 rounded-md border" style={{ maxWidth: "100%" }} />
            {imageName && <p className="mt-2 text-xs text-gray-500">Archivo: {imageName}</p>}
          </div>

          <div className="col-span-1 p-4 border rounded-lg">
            <label className="block font-medium">2. Seleccionar enfermedad</label>
            <select value={disease} onChange={handleDiseaseChange} className="mt-2 w-full p-2 rounded-md border">
              {Object.keys(DISEASES).map((k) => (
                <option key={k} value={k}>
                  {DISEASES[k].label}
                </option>
              ))}
            </select>

            <div className="mt-4">
              <p className="text-sm text-gray-600">Descripción:</p>
              <p className="text-sm">{DISEASES[disease].desc}</p>
            </div>

            <div className="mt-4">
              <p className="text-sm text-gray-600">3. Preventas</p>
              <ul className="text-xs list-disc pl-4 text-gray-600">
                <li>El infrarrojo solo acepta tiempo en minutos (sin segundos) — la app programará por minutos enteros.</li>
                <li>El control del LED normalmente se realiza desde la app del fabricante (Hue, LIFX, etc.). Este sistema genera los valores a aplicar allí.</li>
                <li>Validar los parámetros con personal de salud antes de usar.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold">Resultados del análisis</h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded">
              <p className="text-xs text-gray-500">Color promedio (muestra central)</p>
              <div className="mt-2 h-12 rounded flex items-center justify-center font-mono text-sm">
                {avgColor ? (
                  <div className="w-full h-full rounded flex items-center justify-center" style={{ background: avgColor.hex }}>
                    <span className="backdrop-blur-sm text-white/90 drop-shadow">{avgColor.hex}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
              {avgColor && (
                <p className="mt-2 text-xs">RGB: {avgColor.r}, {avgColor.g}, {avgColor.b}</p>
              )}
            </div>

            <div className="p-4 border rounded">
              <p className="text-xs text-gray-500">Fototipo estimado</p>
              <div className="mt-2 text-2xl font-bold">{phototype || "—"}</div>
              <p className="mt-2 text-xs text-gray-500">Heurística aproximada. Validar clínicamente.</p>
            </div>

            <div className="p-4 border rounded">
              <p className="text-xs text-gray-500">Ajustes recomendados</p>
              {settings ? (
                <div className="mt-2 text-sm">
                  <p>LED color: <strong>{settings.led.color}</strong></p>
                  <p>Intensidad: <strong>{settings.led.intensity_pct}%</strong></p>
                  <p>Infrarrojo: <strong>{settings.infrared.minutes} min</strong></p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">—</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={copyToClipboard} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow">Copiar JSON</button>
            <button onClick={downloadJSON} className="px-4 py-2 rounded-lg border">Descargar JSON</button>
          </div>
        </section>

        <section className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-300 rounded">
          <h3 className="font-semibold">Notas importantes de seguridad</h3>
          <ul className="text-sm list-disc pl-5 mt-2">
            <li>Este sistema *no* reemplaza la evaluación médica. Los valores son heurísticos y requieren validación clínica.</li>
            <li>El tiempo de infrarrojo se expresa siempre en minutos enteros (no segundos). Use una toma inteligente para programar encendido/apagado con precisión de minutos.</li>
            <li>Si la piel está muy sensible, con signos de infección o el paciente tiene condiciones que contraindicquen calor, no aplicar IR sin supervisión médica.</li>
          </ul>
        </section>

        <section className="mt-6 p-4 border rounded">
          <h3 className="font-semibold">Cómo usar estos valores en la práctica</h3>
          <ol className="list-decimal pl-5 text-sm mt-2">
            <li>Suba la foto del área a tratar y seleccione la enfermedad.</li>
            <li>Copie o descargue el JSON con los parámetros sugeridos.</li>
            <li>Abra la app del fabricante del LED (por ejemplo, Philips Hue, LIFX) y ajuste color/intensidad según el JSON.</li>
            <li>Use una toma inteligente (TP-Link Kasa, Sonoff, etc.) que permita programar encendido por la cantidad de minutos indicada para el infrarrojo.</li>
          </ol>

          <div className="mt-3 text-xs text-gray-600">
            <strong>Plataformas recomendadas para desplegar la web:</strong>
            <ul className="list-disc pl-5 mt-1">
              <li>Vercel — despliegue instantáneo desde GitHub, excelente para React.</li>
              <li>Netlify — fácil, con funciones y formularios integrados.</li>
              <li>Firebase Hosting — si quieres integrar auth y base de datos en Google Cloud.</li>
            </ul>
          </div>
        </section>

        <footer className="mt-6 text-xs text-gray-500">
          <p>Entregado: prototipo web visual + generador de parámetros. Para integrar control directo con dispositivos de terceros, necesitarás usar las APIs oficiales de esos fabricantes o el sistema de automatización (Home Assistant, HomeKit, Google Home) y respetar sus requisitos de seguridad y autenticación.</p>
        </footer>
      </div>
    </div>
  );
}
