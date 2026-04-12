import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  PlusCircle,
  Trash2,
  LogOut,
  Calculator,
  Calendar,
  User,
  ChevronRight,
  AlertCircle,
  Clock,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Timer,
  History,
  Lock,
  Loader2,
  Cloud,
  BookText,
  Download,
  FileText,
  Zap,
  Flame,
  Coffee,
  Activity,
} from "lucide-react";

import { ADMIN_ID, WORKER_ID, ADMIN_NAME, WORKER_NAME, TASK_RATE, APP_ID as appId } from "./constants";
import StatCard from "./components/StatCard";
import TimelineItem from "./components/TimelineItem";

// ==========================================
// 1. FIREBASE CONFIG & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// 3. MAIN APPLICATION
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [sharedId, setSharedId] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [entries, setEntries] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [visibleActivityCount, setVisibleActivityCount] = useState(5);
  const [visibleDaysCount, setVisibleDaysCount] = useState(3);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [workingStatus, setWorkingStatus] = useState("Idle");

  const statusConfig = [
    {
      name: "Sherry",
      icon: Zap,
      activeClass:
        "bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.6)] border-violet-400 dark:border-violet-500 scale-105 z-10",
    },
    {
      name: "Akuma",
      icon: Flame,
      activeClass:
        "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.6)] border-blue-400 dark:border-blue-500 scale-105 z-10",
    },
    {
      name: "Idle",
      icon: Coffee,
      activeClass:
        "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] border-emerald-400 dark:border-emerald-500 scale-105 z-10",
    },
  ];

  // Hardcode the storage ID so both admin and worker access the exact same database collection
  const storageId = "shared_ledger"; 
  const isAdmin = useMemo(
    () => sharedId.trim().toUpperCase() === ADMIN_ID.toUpperCase(),
    [sharedId],
  );

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    startCount: "",
    endCount: "",
  });

  // Apply dark mode theme to the HTML element
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setError("Database connection failed.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !isAuthorized || !storageId) return;
    setLoading(true);
    
    const ledgerRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `ledger_${storageId}`,
    );
    const unsubLedger = onSnapshot(
      ledgerRef,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setEntries(
          data.sort(
            (a, b) =>
              new Date(b.date) - new Date(a.date) ||
              b.time.localeCompare(a.time),
          ),
        );
        setLoading(false);
      },
      (err) => {
        setError("Sync failed.");
        setLoading(false);
      },
    );

    // Separate listener for Activity Log
    const activityRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `activity_${storageId}`
    );
    const unsubActivity = onSnapshot(activityRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setActivities(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    // Listener for Working Status
    const statusDocRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      `status_${storageId}`,
      "current"
    );
    const unsubStatus = onSnapshot(statusDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setWorkingStatus(docSnap.data().workingStatus || "Idle");
      }
    });

    return () => {
      unsubLedger();
      unsubActivity();
      unsubStatus();
    };
  }, [authReady, user, isAuthorized, storageId]);

  const globalStats = useMemo(() => {
    const totalTasks = entries.reduce((sum, e) => sum + (e.subTotal || 0), 0);
    const pendingTasks = entries
      .filter((e) => e.status !== "done")
      .reduce((sum, e) => sum + (e.subTotal || 0), 0);
    return {
      totalTasks,
      totalEarnings: totalTasks * TASK_RATE,
      pendingEarnings: pendingTasks * TASK_RATE,
    };
  }, [entries]);

  const handleStatusChange = async (newStatus) => {
    if (workingStatus === newStatus) return;
    setWorkingStatus(newStatus);
    try {
      const statusDocRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `status_${storageId}`,
        "current"
      );
      await setDoc(statusDocRef, { workingStatus: newStatus, updatedAt: serverTimestamp() }, { merge: true });
      await logActivity("STATUS", `changed working status to ${newStatus}`);
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const enteredId = sharedId.trim().toUpperCase();
    if (enteredId === ADMIN_ID.toUpperCase() || enteredId === WORKER_ID.toUpperCase()) {
      setIsAuthorized(true);
      setError(null);
    } else {
      setError("Invalid User ID.");
    }
  };

  // Helper function to log distinct actions
  const logActivity = async (action, description) => {
    try {
      const activityRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `activity_${storageId}`
      );
      await addDoc(activityRef, {
      actor: isAdmin ? ADMIN_NAME : WORKER_NAME,
        action,
        description,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to write to activity log", err);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    const start = parseInt(formData.startCount);
    const end = parseInt(formData.endCount);

    // 1. Prevent invalid or negative inputs
    if (isNaN(start) || isNaN(end) || start < 0 || end < 0) {
      setError("Counts must be valid positive numbers.");
      return;
    }

    // 2. Prevent mathematically impossible tasks
    if (end <= start) {
      setError("End count must be strictly higher than Start count.");
      return;
    }

    // 3. Prevent accidental typos (e.g. accidentally typing 50000 instead of 500)
    if (end - start > 2000) {
      if (!window.confirm(`⚠️ You are about to log an unusually high number of tasks (${end - start}). Are you sure this is correct?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const ledgerRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `ledger_${storageId}`,
      );
      await addDoc(ledgerRef, {
        ...formData,
        startCount: start,
        endCount: end,
        subTotal: end - start,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      await logActivity("LOG", `logged ${end - start} tasks`);

      setFormData((prev) => ({
        ...prev,
        startCount: "",
        endCount: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      }));
      setError(null);
    } catch (err) {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus, taskCount) => {
    if (!isAdmin) return;
    try {
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `ledger_${storageId}`,
        id,
      );
      await updateDoc(docRef, {
        status: currentStatus === "done" ? "pending" : "done",
      });
      await logActivity("STATUS", `marked ${taskCount} tasks as ${currentStatus === "done" ? "pending" : "done"}`);
    } catch (err) {
      setError("Update failed.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteModalId) return;
    const id = deleteModalId;
    setDeleteModalId(null); // Close the modal immediately
    
    try {
      const entryToDelete = entries.find((e) => e.id === id);
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        `ledger_${storageId}`,
        id,
      );
      await deleteDoc(docRef);
      
      if (entryToDelete) {
        await logActivity("DELETE", `deleted an entry of ${entryToDelete.subTotal} tasks`);
      }
    } catch (err) {
      setError("Delete failed.");
    }
  };

  const exportToCSV = () => {
    if (entries.length === 0) {
      alert("No data to export");
      return;
    }
    const headers = ["Date", "Time", "Start Count", "End Count", "Tasks", "Earning ($)", "Status"];
    const rows = entries.map((e) => [
      e.date,
      e.time,
      e.startCount,
      e.endCount,
      e.subTotal,
      (e.subTotal * TASK_RATE).toFixed(3),
      (e.status || "pending").toUpperCase(),
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Task_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    if (entries.length === 0) {
      alert("No data to export");
      return;
    }
    try {
      const doc = new jsPDF();
      doc.text(`Task Ledger Report - ${sharedId}`, 14, 15);

      const tableColumn = ["Date", "Time", "Start Count", "End Count", "Tasks", "Earning ($)", "Status"];
      const tableRows = entries.map((e) => [
        e.date, e.time, e.startCount, e.endCount, e.subTotal,
        (e.subTotal * TASK_RATE).toFixed(3),
        (e.status || "pending").toUpperCase(),
      ]);

      autoTable(doc, {
        head: [tableColumn], body: tableRows, startY: 20, theme: "grid",
        styles: { fontSize: 8 }, headStyles: { fillColor: [16, 185, 129] },
      });
      doc.save(`Task_Ledger_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Failed to export PDF.");
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "Just now";
    const date = new Date(ts.seconds * 1000);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const groupedEntries = useMemo(() => {
    const groups = {};
    entries.forEach((entry) => {
      if (!groups[entry.date]) {
        groups[entry.date] = { items: [], tasks: 0, earnings: 0 };
      }
      groups[entry.date].items.push(entry);
      groups[entry.date].tasks += entry.subTotal || 0;
      groups[entry.date].earnings += (entry.subTotal || 0) * TASK_RATE;
    });
    return Object.entries(groups).sort(
      (a, b) => new Date(b[0]) - new Date(a[0]),
    );
  }, [entries]);

  const visibleGroupedEntries = groupedEntries.slice(0, visibleDaysCount);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
        <div className="bg-slate-800/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.15)] w-full max-w-md border border-emerald-500/30 dark:border-emerald-500/30">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-emerald-500/20 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)] p-4 rounded-xl mb-4">
              <BookText className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">Task Ledger</h1>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
              Enter your unique ID to sync work
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="text"
                required
                value={sharedId}
                onChange={(e) => setSharedId(e.target.value)}
                className="w-full bg-slate-700/50 dark:bg-slate-800/50 backdrop-blur-sm border border-emerald-500/30 rounded-lg pl-10 pr-4 py-3 text-white focus:border-emerald-500 focus:shadow-[0_0_20px_rgba(16,185,129,0.3)] outline-none transition-all"
                placeholder="Unique ID"
              />
            </div>
            {error && (
              <div className="text-red-400 text-xs text-center">{error}</div>
            )}
            <button
              type="submit"
              className="w-full bg-emerald-500/90 hover:bg-emerald-500 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              Sync Data <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">



      <nav className=" rounded-b-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-t-0 border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_4px_25px_rgba(16,185,129,0.1)] sticky top-0 z-20 px-4 h-16 flex items-center justify-between md:px-8 md:w-[80%] md:mx-auto transition-all">

        <div className="flex items-center gap-2 pt-2">
          <BookText className="text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)] w-6 h-6 hidden md:block" />
          <div className="flex flex-col px-1 ">
            <span className=" text-xl font-bold text-slate-800 dark:text-white leading-none drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
              Task Ledger
            </span>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[12px] text-slate-400 dark:text-slate-500 font-mono tracking-tight">
                {sharedId}
              </span>
              {loading ? (
                <Loader2 className="w-3 h-3 text-slate-300 animate-spin" />
              ) : (
                <Cloud className="w-3 h-3 text-emerald-400" />
              )}
            </div>
          </div>
        </div>



        <div className="flex items-center gap-3 ">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm ${isAdmin ? "bg-emerald-50/50 dark:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-slate-100/50 dark:bg-slate-800/50 border-slate-500/30 text-slate-600 dark:text-slate-300 shadow-[0_0_10px_rgba(148,163,184,0.2)]"}`}
          >
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isAdmin ? "Admin" : "Worker"}
            </span>
          </div>
          <button
            onClick={() => setIsAuthorized(false)}
            className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-2 rounded-full hover:bg-red-500/10 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>



      <main className="max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Working Status Bar */}
        <div className={`bg-white dark:bg-slate-900 rounded-xl border p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-500 relative overflow-hidden ${
          workingStatus === 'Sherry' ? 'border-violet-500/50 shadow-[0_0_30px_rgba(139,92,246,0.2)] dark:shadow-[0_0_30px_rgba(139,92,246,0.15)]' :
          workingStatus === 'Akuma' ? 'border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)] dark:shadow-[0_0_30px_rgba(59,130,246,0.15)]' :
          workingStatus === 'Idle' ? 'border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.2)] dark:shadow-[0_0_30px_rgba(16,185,129,0.15)]' :
          'border-slate-200 dark:border-slate-800 shadow-sm'
        }`}>
          {/* Subtle background glow depending on status */}
          <div className={`absolute inset-0 opacity-10 dark:opacity-20 transition-colors duration-500 ${
            workingStatus === 'Sherry' ? 'bg-violet-500' :
            workingStatus === 'Akuma' ? 'bg-blue-500' :
            workingStatus === 'Idle' ? 'bg-emerald-500' :
            'bg-transparent'
          }`} />
          
          <div className="flex items-center gap-3 relative z-10">
            <div className={`p-2 rounded-xl transition-all duration-500 border ${
              workingStatus === 'Sherry' ? 'bg-violet-100 dark:bg-violet-500/30 text-violet-600 dark:text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.5)] border-violet-300 dark:border-violet-500' :
              workingStatus === 'Akuma' ? 'bg-blue-100 dark:bg-blue-500/30 text-blue-600 dark:text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-300 dark:border-blue-500' :
              workingStatus === 'Idle' ? 'bg-emerald-100 dark:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] border-emerald-300 dark:border-emerald-500' :
              'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent'
            }`}>
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Current Status</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">who is working right now?</p>
            </div>
          </div>
          
          <div className={`flex p-1.5 rounded-xl border backdrop-blur-sm relative z-10 transition-all duration-500 ${
            workingStatus === 'Sherry' ? 'bg-violet-50/50 dark:bg-violet-900/30 border-violet-200/50 dark:border-violet-700/50 shadow-[0_0_15px_rgba(139,92,246,0.15)]' :
            workingStatus === 'Akuma' ? 'bg-blue-50/50 dark:bg-blue-900/30 border-blue-200/50 dark:border-blue-700/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' :
            workingStatus === 'Idle' ? 'bg-emerald-50/50 dark:bg-emerald-900/30 border-emerald-200/50 dark:border-emerald-700/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]' :
            'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/50'
          }`}>
            {statusConfig.map(({ name, icon: Icon, activeClass }) => {
              const isActive = workingStatus === name;
              return (
                <button
                  key={name}
                  onClick={() => handleStatusChange(name)}
                  className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border transition-all duration-300 ${
                    isActive
                      ? activeClass
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive && name !== 'Idle' ? "fill-current" : ""}`} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Tasks"
            value={globalStats.totalTasks.toLocaleString()}
            colorClass="border-l-slate-400"
            icon={Calculator}
          />
          <StatCard
            title="Total Earned"
            value={`$${globalStats.totalEarnings.toFixed(3)}`}
            colorClass="border-l-emerald-500"
            icon={TrendingUp}
          />
          <StatCard
            title="Unpaid Amount"
            value={`$${globalStats.pendingEarnings.toFixed(3)}`}
            colorClass="border-l-amber-500"
            icon={Timer}
          />
        </div>

        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl border border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)] overflow-hidden transition-all">
          <div className="p-4 border-b border-emerald-500/20 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-900/10 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> New Session
            </h3>
            {saving && (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            )}
          </div>
          <form
            onSubmit={handleAddEntry}
            className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Date & Time
              </label>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="w-full border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg px-2 py-2 text-xs bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm dark:text-white focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.2)] outline-none transition-all"
                />
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) =>
                    setFormData({ ...formData, time: e.target.value })
                  }
                  className="w-32 border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg px-2 py-2 text-xs bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm dark:text-white focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.2)] outline-none transition-all"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Start Count
              </label>
              <input
                type="number"
                required
                min={0}
                placeholder="0"
                value={formData.startCount}
                onChange={(e) =>
                  setFormData({ ...formData, startCount: e.target.value })
                }
                className="w-full border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg px-3 py-2 text-sm bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm dark:text-white focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.2)] outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                End Count
              </label>
              <input
                type="number"
                min={0}
                required
                placeholder="0"
                value={formData.endCount}
                onChange={(e) =>
                  setFormData({ ...formData, endCount: e.target.value })
                }
                className="w-full border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg px-3 py-2 text-sm bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm dark:text-white focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.2)] outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className={`font-bold py-2 rounded-lg transition-all border backdrop-blur-sm ${saving ? "bg-slate-300/50 dark:bg-slate-700/50 border-slate-400/50" : "bg-emerald-500/90 hover:bg-emerald-500 border-emerald-400/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)]"}`}
            >
              Add Entry
            </button>
          </form>
        </div>


        {/* Task Entries Table */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl border border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)] overflow-hidden mb-8 transition-all">
          <div className="p-4 border-b border-emerald-500/20 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-900/10 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <BookText className="w-4 h-4 text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> Ledger Data
            </h3>
            <div className="flex gap-2">
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-emerald-500/30 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-emerald-500/30 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-emerald-50/20 dark:bg-emerald-900/10 border-b border-emerald-500/10 dark:border-emerald-500/10 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest transition-colors">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">counts</th>
                  <th className="px-6 py-4 text-right">Tasks</th>
                  <th className="px-6 py-4 text-right">Earning</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {loading && entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="p-12 text-center text-slate-400 dark:text-slate-500 animate-pulse"
                    >
                      Syncing...
                    </td>
                  </tr>
                ) : groupedEntries.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-12 text-center text-slate-400 dark:text-slate-500">
                      No data found.
                    </td>
                  </tr>
                ) : (
                  visibleGroupedEntries.map(([date, group]) => (
                    <React.Fragment key={date}>
                      {group.items.map((item, index) => (
                        <tr
                          key={item.id}
                          className="border-b border-emerald-500/5 dark:border-emerald-500/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors"
                        >
                          {index === 0 ? (
                            <td
                              rowSpan={group.items.length}
                              className="px-6 py-4 align-top border-r border-emerald-500/5 dark:border-emerald-500/10 bg-emerald-50/10 dark:bg-emerald-900/5"
                            >
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 dark:text-white">
                                  {new Date(date).toLocaleDateString(
                                    undefined,
                                    {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                    },
                                  )}
                                </span>
                                <div className="mt-2 p-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded border border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                                  <p className="text-[8px] text-slate-400 dark:text-slate-500 font-black uppercase">
                                    Daily Sum
                                  </p>
                                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {group.tasks} Tasks
                                  </p>
                                  <p className="text-emerald-600 font-bold text-xs">
                                    ${group.earnings.toFixed(3)}
                                  </p>
                                </div>
                              </div>
                            </td>
                          ) : null}
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {item.time}
                          </td>
                          <td className="px-6 py-4 text-xs font-mono dark:text-slate-300">
                            {item.startCount}-{item.endCount}
                          </td>
                          <td className="px-6 py-4 text-right font-medium dark:text-slate-200">
                            +{item.subTotal}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-emerald-600">
                            ${(item.subTotal * TASK_RATE).toFixed(3)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              disabled={!isAdmin}
                              onClick={() => toggleStatus(item.id, item.status, item.subTotal)}
                              className={`flex items-center gap-1 mx-auto px-2 py-1 rounded-md text-[10px] font-bold border backdrop-blur-sm transition-all ${item.status === "done" ? "bg-emerald-100/50 dark:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-amber-100/50 dark:bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]"}`}
                            >
                              {item.status === "done" ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <Timer className="w-3 h-3" />
                              )}
                              {(item.status || "PENDING").toUpperCase()}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setDeleteModalId(item.id)}
                              className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {groupedEntries.length > 3 && (
            <div className="p-4 border-t border-emerald-500/20 dark:border-emerald-500/20 flex justify-center bg-emerald-50/20 dark:bg-emerald-900/10">
              {visibleDaysCount < groupedEntries.length ? (
                <button
                  onClick={() => setVisibleDaysCount((prev) => prev + 3)}
                  className="bg-white/50 hover:bg-emerald-50 dark:bg-slate-800/50 dark:hover:bg-emerald-900/30 backdrop-blur-sm text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-6 rounded-full transition-all border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  View Older Days
                </button>
              ) : (
                <button
                  onClick={() => setVisibleDaysCount(3)}
                  className="bg-white/50 hover:bg-emerald-50 dark:bg-slate-800/50 dark:hover:bg-emerald-900/30 backdrop-blur-sm text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-6 rounded-full transition-all border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  Show Less
                </button>
              )}
            </div>
          )}
        </div>



        {/* Activity Log Section */}
        <div className="space-y-4 mt-10 mb-18">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">Activity Log</h2>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl border border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)] p-8 relative transition-all">
            <div className="absolute left-[47px] top-10 bottom-10 w-px bg-emerald-500/20 dark:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
            <div className="space-y-4 relative">
              {activities.slice(0, visibleActivityCount).map((activity) => (
                <TimelineItem
                  key={activity.id}
                  activity={activity}
                  formatTimestamp={formatTimestamp}
                />
              ))}
              {activities.length === 0 && (
                <p className="text-center text-slate-400 dark:text-slate-500 py-4 italic">
                  No history yet.
                </p>
              )}
            </div>
            {activities.length > 5 && (
              <div className="mt-6 flex justify-center relative z-10">
                {visibleActivityCount < activities.length ? (
                  <button
                    onClick={() => setVisibleActivityCount((prev) => prev + 5)}
                    className="bg-slate-800/50 hover:bg-emerald-900/30 backdrop-blur-sm text-slate-300 text-xs font-bold py-2.5 px-5 rounded-full transition-all border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:text-emerald-400"
                  >
                    View More Activity
                  </button>
                ) : (
                  <button
                    onClick={() => setVisibleActivityCount(5)}
                    className="bg-slate-800/50 hover:bg-emerald-900/30 backdrop-blur-sm text-slate-300 text-xs font-bold py-2.5 px-5 rounded-full transition-all border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:text-emerald-400"
                  >
                    Show Less
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>



      {/* Mobile Summary Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 rounded-t-3xl dark:bg-slate-900/80 backdrop-blur-xl border-t border-emerald-500/30 p-4 flex items-center justify-between shadow-[0_-10px_40px_rgba(16,185,129,0.15)] z-30 transition-all ">
        <div>
          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">
            Total Pay
          </div>
          <div className="font-bold text-emerald-600 text-xl drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
            ${globalStats.totalEarnings.toFixed(3)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">
            Pending
          </div>
          <div className="font-bold text-amber-600 text-lg drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
            ${globalStats.pendingEarnings.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {deleteModalId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md transition-opacity"
          onClick={() => setDeleteModalId(null)}
        >
          <div 
            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.2)] w-full max-w-sm border border-red-500/30 overflow-hidden transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100/50 dark:bg-red-500/20 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.4)] text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Delete Entry?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Are you sure you want to permanently delete this entry? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModalId(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300/50 dark:border-slate-600/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:shadow-[0_0_15px_rgba(148,163,184,0.2)] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/90 hover:bg-red-500 border border-red-400/50 text-white font-bold transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
