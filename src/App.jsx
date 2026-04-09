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

    return () => {
      unsubLedger();
      unsubActivity();
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
        <div className="bg-slate-800 dark:bg-slate-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 dark:border-slate-800">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-emerald-500 p-4 rounded-xl mb-4">
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
                className="w-full bg-slate-700 dark:bg-slate-800 border border-slate-600 dark:border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
                placeholder="Unique ID"
              />
            </div>
            {error && (
              <div className="text-red-400 text-xs text-center">{error}</div>
            )}
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
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



      <nav className=" rounded-b-2xl bg-white dark:bg-slate-900 border-b dark:border-slate-800 sticky top-0 z-20 px-4 h-16 flex items-center justify-between shadow-sm md:px-8  md:w-[80%] md:mx-auto">

        <div className="flex items-center gap-2 pt-2">
          <BookText className="text-emerald-600 w-6 h-6 hidden md:block" />
          <div className="flex flex-col px-1 ">
            <span className=" text-xl font-bold text-slate-800 dark:text-white leading-none">
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isAdmin ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}
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
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>



      <main className="max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
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

        <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-4 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-500" /> New Session
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
                  className="w-full border dark:border-slate-700 rounded-lg px-2 py-2 text-xs bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
                />
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) =>
                    setFormData({ ...formData, time: e.target.value })
                  }
                  className="w-32 border dark:border-slate-700 rounded-lg px-2 py-2 text-xs bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
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
                className="w-full border dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
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
                className="w-full border dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className={`font-bold py-2 rounded-lg transition-all shadow-md ${saving ? "bg-slate-300 dark:bg-slate-700" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
            >
              Add Entry
            </button>
          </form>
        </div>


        {/* Task Entries Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden mb-8 transition-colors">
          <div className="p-4 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <BookText className="w-4 h-4 text-emerald-500" /> Ledger Data
            </h3>
            <div className="flex gap-2">
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest transition-colors">
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
                          className="border-b dark:border-slate-800 border-slate-100 hover:bg-slate-50/50 dark:hover:bg-slate-800 transition-colors"
                        >
                          {index === 0 ? (
                            <td
                              rowSpan={group.items.length}
                              className="px-6 py-4 align-top border-r dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50"
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
                                <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
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
                              className={`flex items-center gap-1 mx-auto px-2 py-1 rounded-md text-[10px] font-bold ${item.status === "done" ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
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
                              className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
            <div className="p-4 border-t dark:border-slate-800 flex justify-center bg-slate-50 dark:bg-slate-800/30">
              {visibleDaysCount < groupedEntries.length ? (
                <button
                  onClick={() => setVisibleDaysCount((prev) => prev + 3)}
                  className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-6 rounded-full transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  View Older Days
                </button>
              ) : (
                <button
                  onClick={() => setVisibleDaysCount(3)}
                  className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-6 rounded-full transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
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
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Activity Log</h2>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm p-8 relative transition-colors">
            <div className="absolute  left-[47px] top-10 bottom-10 w-px bg-slate-100 dark:bg-slate-800"></div>
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
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 px-5 rounded-full transition-colors border border-slate-700 shadow-sm"
                  >
                    View More Activity
                  </button>
                ) : (
                  <button
                    onClick={() => setVisibleActivityCount(5)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 px-5 rounded-full transition-colors border border-slate-700 shadow-sm"
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-2xl dark:bg-slate-900 border-t dark:border-slate-800 p-4 flex items-center justify-between shadow-2xl z-30 transition-colors ">
        <div>
          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">
            Total Pay
          </div>
          <div className="font-bold text-emerald-600 text-xl">
            ${globalStats.totalEarnings.toFixed(3)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">
            Pending
          </div>
          <div className="font-bold text-amber-600 text-lg">
            ${globalStats.pendingEarnings.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {deleteModalId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          onClick={() => setDeleteModalId(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 overflow-hidden transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Delete Entry?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Are you sure you want to permanently delete this entry? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModalId(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors shadow-sm shadow-red-500/20"
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
