"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STORAGE_KEY = "cash_register_draft";

export default function Page() {
  const [baseBackend, setBaseBackend] = useState<number | null>(null);
  const [baseValue, setBaseValue] = useState<number | "">("");

  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  // 🔥 REGLA GENERAL (NO TOCAR)
  const isEditable = !baseBackend;

  // -----------------------------------
  // 🔹 Cargar base desde Supabase
  // -----------------------------------
  useEffect(() => {
    loadBase();
  }, []);

  const loadBase = async () => {
    const { data } = await supabase
      .from("cash_register")
      .select("base_recibida")
      .limit(1)
      .single();

    if (data?.base_recibida) {
      setBaseBackend(data.base_recibida);
      setBaseValue(data.base_recibida);
    } else {
      checkDraft();
    }
  };

  // -----------------------------------
  // 🔹 Revisar borrador
  // -----------------------------------
  const checkDraft = () => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      setDraft(JSON.parse(saved));
      setShowModal(true);
    } else {
      setBaseValue("");
    }
  };

  // -----------------------------------
  // 🔹 Continuar borrador
  // -----------------------------------
  const handleContinuar = () => {
    setBaseValue(draft?.base ?? "");
    setShowModal(false);
  };

  // -----------------------------------
  // 🔹 Limpiar borrador
  // -----------------------------------
  const handleLimpiar = () => {
    localStorage.removeItem(STORAGE_KEY);
    setBaseValue("");
    setShowModal(false);
  };

  // -----------------------------------
  // 🔹 Guardar borrador
  // -----------------------------------
  useEffect(() => {
    if (!isEditable) return;

    const t = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ base: baseValue })
      );
    }, 500);

    return () => clearTimeout(t);
  }, [baseValue, isEditable]);

  // -----------------------------------
  // 🔹 Guardar en Supabase
  // -----------------------------------
  const handleGuardar = async () => {
    if (!baseValue) return;

    await supabase.from("cash_register").insert([
      {
        base_recibida: baseValue,
      },
    ]);

    setBaseBackend(Number(baseValue));
    localStorage.removeItem(STORAGE_KEY);
  };

  // -----------------------------------
  // 🔹 UI
  // -----------------------------------
  return (
    <div style={{ padding: 20 }}>
      <h1>Cierre de Caja</h1>

      {showModal && (
        <div style={modal}>
          <h3>Borrador recuperado</h3>

          <button onClick={handleContinuar}>
            Continuar
          </button>

          <button onClick={handleLimpiar}>
            Limpiar y empezar de nuevo
          </button>
        </div>
      )}

      <input
        type="number"
        value={baseValue}
        onChange={(e) =>
          setBaseValue(
            e.target.value === "" ? "" : Number(e.target.value)
          )
        }
        disabled={!isEditable}
        placeholder="Ingresa la base"
        style={{
          padding: 10,
          width: "100%",
          marginTop: 20,
          background: isEditable ? "white" : "#eee",
        }}
      />

      <button onClick={handleGuardar} style={{ marginTop: 20 }}>
        Guardar cierre
      </button>
    </div>
  );
}

const modal = {
  position: "fixed" as const,
  top: "30%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  background: "white",
  padding: 20,
  border: "1px solid #ccc",
};
