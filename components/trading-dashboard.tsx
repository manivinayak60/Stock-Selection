'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  Download,
  ExternalLink,
  Gauge,
  HeartPulse,
  Info,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  RefreshCw,
  Radio,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignOutButton } from '@/components/sign-out-button';
import {
  buildOpportunities,
  defaultSettings,
  type CandidateSnapshot,
  type BrokerConnectionStatus,
  type LiveQuote,
  type Opportunity,
  type PaperTrade,
  type Settings,
} from '@/lib/trading';

type ViewId =
  | 'dashboard'
  | 'opportunities'
  | 'watchlist'
  | 'portfolio'
  | 'journal'
  | 'health'
  | 'settings';
type PersistedState = {
  settings?: Settings;
  watchlist?: { symbol: string }[];
  trades?: PaperTrade[];
  runs?: ScanRun[];
};
type ScanRun = {
  id?: number;
  marketDate: string;
  provider: string;
  status: string;
  universeCount: number;
  qualifiedCount: number;
  createdAt: string;
};
type MarketMeta = {
  runId: string;
  marketDate: string;
  status: string;
  marketRegime: string;
  universeCount: number;
  receivedCount: number;
  validatedCount: number;
  qualifiedCount: number;
  failedCount: number;
  source: string;
  completedAt: string | null;
  warnings: string[];
  missingSymbols: string[];
  stale: boolean;
};

const nav: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Morning brief', icon: LayoutDashboard },
  { id: 'opportunities', label: 'Opportunities', icon: ListFilter },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'portfolio', label: 'Portfolio & risk', icon: BriefcaseBusiness },
  { id: 'journal', label: 'Journal & performance', icon: BarChart3 },
  { id: 'health', label: 'Data health', icon: Database },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: digits,
  }).format(value);
const formatMarketDate = (date: string | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(`${date}T12:00:00+05:30`))
    : 'No validated scan';
const formatIstDateTime = (date: string | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(date)) + ' IST'
    : 'Not synced yet';

const currentMove = (stock: Opportunity) =>
  stock.liveChangePercent ?? stock.change;

const getNiftyBullish20 = (stocks: Opportunity[]) =>
  [...stocks]
    .filter((stock) => currentMove(stock) > 0)
    .sort(
      (a, b) =>
        currentMove(b) - currentMove(a) || b.score - a.score,
    )
    .slice(0, 20);

async function postState(
  payload: Record<string, unknown>,
): Promise<{ id?: number; [key: string]: unknown }> {
  const response = await fetch('/api/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    error?: string;
    id?: number;
    [key: string]: unknown;
  };
  if (!response.ok) throw new Error(data.error || 'Unable to save');
  return data;
}

function MiniChart({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 116 + 2},${38 - ((v - min) / range) * 32}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 120 42"
      className="h-10 w-28"
      aria-label="Recent price trend"
    >
      <title>Recent price trend</title>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusPill({ status }: { status: Opportunity['status'] }) {
  const cls =
    status === 'Strong'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'Qualified'
        ? 'bg-blue-50 text-blue-800'
        : 'bg-amber-50 text-amber-800';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Gauge;
  tone: string;
}) {
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`metric-icon ${tone}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Star;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="size-5" />
        </div>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">
          {text}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function TradingDashboard() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [filter, setFilter] = useState('');
  const [scanState, setScanState] = useState<'idle' | 'running' | 'complete'>(
    'idle',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Settings>(defaultSettings);
  const [persistent, setPersistent] = useState(true);
  const [marketCandidates, setMarketCandidates] = useState<CandidateSnapshot[]>([]);
  const [marketMeta, setMarketMeta] = useState<MarketMeta | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnectionStatus[]>([]);
  const [liveQuotes, setLiveQuotes] = useState<LiveQuote[]>([]);

  const candidatesWithLivePrices = useMemo(() => {
    const connectionReady = brokerConnections.some(
      (item) => item.provider === settings.provider && item.connected,
    );
    const quotes = new Map(
      (settings.provider === 'FREE_EOD' || !connectionReady ? [] : liveQuotes)
        .filter((quote) => quote.provider === settings.provider)
        .map((quote) => [quote.symbol, quote]),
    );
    return marketCandidates.map((candidate) => {
      const quote = quotes.get(candidate.symbol);
      return quote
        ? {
            ...candidate,
            livePrice: quote.lastPrice,
            liveChangePercent: quote.changePercent,
            liveUpdatedAt: quote.updatedAt,
            liveProvider: quote.provider,
          }
        : candidate;
    });
  }, [brokerConnections, liveQuotes, marketCandidates, settings.provider]);

  const opportunities = useMemo(
    () => buildOpportunities(settings, candidatesWithLivePrices),
    [candidatesWithLivePrices, settings],
  );
  const qualified = opportunities.filter((o) => o.status !== 'Watch');
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');
  const openRisk = openTrades.reduce(
    (sum, t) => sum + (t.entry - t.stop) * t.quantity,
    0,
  );
  const invested = openTrades.reduce((sum, t) => sum + t.entry * t.quantity, 0);
  const availableCapital = Math.max(0, settings.capital - invested);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error('state unavailable');
      const data = (await response.json()) as PersistedState;
      if (data.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
        setSettingsDraft({ ...defaultSettings, ...data.settings });
      }
      setWatchlist((data.watchlist ?? []).map((item) => item.symbol));
      setTrades(data.trades ?? []);
      setRuns(data.runs ?? []);
      setPersistent(true);
    } catch {
      setPersistent(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);

  const loadMarket = useCallback(async () => {
    const controller = new AbortController();
    try {
      const response = await fetch('/api/market', {
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        candidates?: CandidateSnapshot[];
        meta?: MarketMeta;
        history?: ScanRun[];
        error?: string;
      };
      if (!response.ok || !data.meta) {
        throw new Error(data.error || 'Validated market scan is unavailable');
      }
      setMarketCandidates(data.candidates ?? []);
      setMarketMeta(data.meta);
      setRuns(data.history ?? []);
      setMarketError(null);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMarketCandidates([]);
        setMarketMeta(null);
        setMarketError(error instanceof Error ? error.message : 'Market scan unavailable');
      }
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- async initial synchronization with the market API
    void loadMarket();
  }, [loadMarket]);

  const loadBrokerStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/brokers/status', { cache: 'no-store' });
      const data = await response.json() as {
        connections?: BrokerConnectionStatus[];
      };
      if (response.ok) setBrokerConnections(data.connections ?? []);
    } catch {
      setBrokerConnections([]);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- async synchronization with the broker status API
    void loadBrokerStatus();
  }, [loadBrokerStatus]);

  useEffect(() => {
    if (settings.provider === 'FREE_EOD') {
      return;
    }
    const connection = brokerConnections.find((item) => item.provider === settings.provider);
    if (!connection?.connected || !marketCandidates.length) {
      return;
    }
    let stopped = false;
    const refresh = async () => {
      const symbols = marketCandidates.slice(0, 50).map((item) => item.symbol).join(',');
      try {
        const response = await fetch(
          `/api/brokers/quotes?provider=${settings.provider}&symbols=${encodeURIComponent(symbols)}`,
          { cache: 'no-store' },
        );
        const data = await response.json() as { quotes?: Omit<LiveQuote, 'provider'>[] };
        if (response.ok && !stopped) {
          setLiveQuotes((data.quotes ?? []).map((quote) => ({ ...quote, provider: settings.provider as Exclude<Settings['provider'], 'FREE_EOD'> })));
        }
      } catch {
        if (!stopped) setLiveQuotes([]);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [brokerConnections, marketCandidates, settings.provider]);

  const toggleWatchlist = useCallback(
    async (symbol: string) => {
      const existed = watchlist.includes(symbol);
      setWatchlist((current) =>
        existed ? current.filter((s) => s !== symbol) : [...current, symbol],
      );
      try {
        await postState({ action: 'toggleWatchlist', symbol });
        notify(
          existed
            ? `${symbol} removed from watchlist`
            : `${symbol} added to watchlist`,
        );
      } catch {
        setWatchlist((current) =>
          existed
            ? current.includes(symbol)
              ? current
              : [...current, symbol]
            : current.filter((item) => item !== symbol),
        );
        setPersistent(false);
        notify('Watchlist update failed; the previous saved state was restored.');
      }
    },
    [notify, watchlist],
  );

  const createTrade = useCallback(
    async (stock: Opportunity) => {
      if (openRisk + stock.plannedRisk > settings.hardRisk) {
        notify('Trade blocked: hard open-risk limit would be exceeded.');
        return;
      }
      if (openTrades.length >= settings.maxPositions) {
        notify('Trade blocked: maximum open positions reached.');
        return;
      }
      const tempTrade: PaperTrade = {
        id: -Date.now(),
        symbol: stock.symbol,
        setup: stock.setup,
        status: 'OPEN',
        entry: stock.entryHigh,
        stop: stock.stop,
        target: stock.target1,
        quantity: stock.quantity,
        openedAt: new Date().toISOString(),
      };
      setTrades((current) => [tempTrade, ...current]);
      setSelected(null);
      try {
        const data = await postState({
          action: 'createTrade',
          trade: tempTrade,
          sector: stock.sector,
        });
        setTrades((current) =>
          current.map((t) =>
            t.id === tempTrade.id
              ? { ...t, id: Number(data.id ?? tempTrade.id) }
              : t,
          ),
        );
        notify(`Paper trade created for ${stock.symbol}`);
      } catch (error) {
        setTrades((current) => current.filter((trade) => trade.id !== tempTrade.id));
        setPersistent(false);
        notify(
          error instanceof Error
            ? error.message
            : 'Paper trade kept for this session.',
        );
      }
    },
    [
      notify,
      openRisk,
      openTrades.length,
      settings.hardRisk,
      settings.maxPositions,
    ],
  );

  const closeTrade = useCallback(
    async (trade: PaperTrade) => {
      const exitPrice =
        opportunities.find((o) => o.symbol === trade.symbol)?.close ??
        trade.entry;
      setTrades((current) =>
        current.map((t) =>
          t.id === trade.id
            ? {
                ...t,
                status: 'CLOSED',
                exitPrice,
                closedAt: new Date().toISOString(),
              }
            : t,
        ),
      );
      if (trade.id > 0) {
        try {
          await postState({ action: 'closeTrade', id: trade.id, exitPrice });
        } catch {
          setTrades((current) =>
            current.map((item) => (item.id === trade.id ? trade : item)),
          );
          setPersistent(false);
          notify('Unable to close the paper trade. The saved position remains open.');
          return;
        }
      }
      notify(`${trade.symbol} paper trade closed at ${money(exitPrice, 2)}`);
    },
    [notify, opportunities],
  );

  const runScan = useCallback(async () => {
    setScanState('running');
    try {
      const response = await fetch('/api/pipeline/run', { method: 'POST' });
      const data = (await response.json()) as {
        error?: string;
        qualifiedCount?: number;
        marketDate?: string;
      };
      if (!response.ok) throw new Error(data.error || 'EOD pipeline failed');
      await loadMarket();
      setScanState('complete');
      notify('Validated NSE EOD scan completed.');
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        window.localStorage.getItem('swing-signal-browser-alerts') === 'enabled'
      ) {
        new Notification('SwingSignal EOD scan completed', {
          body: `${data.qualifiedCount ?? 0} qualified setups for ${data.marketDate ?? 'the latest session'}.`,
        });
      }
      window.setTimeout(() => setScanState('idle'), 1800);
    } catch (error) {
      setScanState('idle');
      notify(error instanceof Error ? error.message : 'EOD scan failed');
    }
  }, [loadMarket, notify]);

  const importFundamentals = useCallback(async (file: File, sourceUrl: string) => {
    if (file.size > 2_000_000) throw new Error('Fundamentals CSV must be smaller than 2 MB');
    const response = await fetch('/api/fundamentals/import', {
      method: 'POST',
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        ...(sourceUrl.trim() ? { 'x-fundamentals-source-url': sourceUrl.trim() } : {}),
      },
      body: await file.text(),
    });
    const data = await response.json() as {
      error?: string;
      importedCount?: number;
      skippedSymbols?: string[];
    };
    if (!response.ok) throw new Error(data.error || 'Fundamentals import failed');
    notify(
      `${data.importedCount ?? 0} fundamental snapshots imported${data.skippedSymbols?.length ? `; ${data.skippedSymbols.length} unknown symbols skipped` : ''}. Rebuilding scores…`,
    );
    await runScan();
  }, [notify, runScan]);

  const saveSettings = useCallback(async () => {
    if (settingsDraft.hardRisk < settingsDraft.normalRisk) {
      notify('Hard risk must be greater than or equal to normal risk.');
      return;
    }
    setSettings(settingsDraft);
    try {
      await postState({ action: 'saveSettings', settings: settingsDraft });
      notify('Settings saved and position sizes recalculated.');
    } catch {
      setPersistent(false);
      notify('Settings applied for this session.');
    }
  }, [notify, settingsDraft]);

  const connectGroww = useCallback(async (accessToken: string) => {
    const response = await fetch('/api/brokers/groww/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || 'Groww connection failed');
    await loadBrokerStatus();
    setSettingsDraft((current) => ({ ...current, provider: 'GROWW_CONNECT' }));
    notify('Groww connected. Save settings to activate live prices.');
  }, [loadBrokerStatus, notify]);

  const disconnectLiveBroker = useCallback(async (
    provider: 'KITE_CONNECT' | 'GROWW_CONNECT',
  ) => {
    const response = await fetch('/api/brokers/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || 'Unable to disconnect broker');
    setSettingsDraft((current) => ({ ...current, provider: 'FREE_EOD' }));
    if (settings.provider === provider) setSettings((current) => ({ ...current, provider: 'FREE_EOD' }));
    setLiveQuotes([]);
    await loadBrokerStatus();
    notify('Broker disconnected. Free NSE EOD remains active.');
  }, [loadBrokerStatus, notify, settings.provider]);

  useEffect(() => {
    const context =
      typeof document === 'undefined'
        ? undefined
        : (
            document as Document & {
              modelContext?: {
                registerTool: (
                  tool: unknown,
                  options?: { signal?: AbortSignal },
                ) => void | Promise<void>;
              };
            }
          ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) =>
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    void register({
      name: 'read_top_opportunities',
      title: 'Read top opportunities',
      description:
        'Return the current ranked NSE swing-trade shortlist and risk plans shown in the app.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () =>
        qualified
          .slice(0, 5)
          .map(
            ({
              symbol,
              score,
              setup,
              entryLow,
              entryHigh,
              stop,
              target1,
              quantity,
              plannedRisk,
            }) => ({
              symbol,
              score,
              setup,
              entryLow,
              entryHigh,
              stop,
              target1,
              quantity,
              plannedRisk,
            }),
          ),
    });
    void register({
      name: 'add_stock_to_watchlist',
      title: 'Add stock to watchlist',
      description:
        'Add one currently screened NSE stock to the same watchlist used by the visible app.',
      inputSchema: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const raw = (input as { symbol?: unknown })?.symbol;
        if (typeof raw !== 'string') throw new Error('symbol must be a string');
        const symbol = raw.toUpperCase();
        if (!opportunities.some((o) => o.symbol === symbol))
          throw new Error('Symbol is not in the current scan');
        if (!watchlist.includes(symbol)) await toggleWatchlist(symbol);
        return { symbol, watchlisted: true };
      },
    });
    return () => lifecycle.abort();
  }, [opportunities, qualified, toggleWatchlist, watchlist]);

  const pageTitle =
    nav.find((item) => item.id === view)?.label ?? 'Morning brief';

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[var(--navy)] px-4 py-5 text-white lg:flex">
        <button
          onClick={() => setView('dashboard')}
          className="flex items-center gap-3 px-2 text-left"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-slate-950 shadow-[0_8px_30px_rgba(52,211,153,.25)]">
            <Activity className="size-5" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">SwingSignal</p>
            <p className="text-xs text-slate-400">NSE research desk</p>
          </div>
        </button>
        <nav className="mt-9 space-y-1" aria-label="Primary navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-current={view === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${view === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon className="size-4" />
              {label}
              {id === 'watchlist' && watchlist.length > 0 && (
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs">
                  {watchlist.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-emerald-400" /> Risk guard
            active
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            New positions are blocked above the {money(settings.hardRisk)} hard
            open-risk limit.
          </p>
        </div>
      </aside>

      <section className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-2 backdrop-blur md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">
              {pageTitle}
            </p>
            <p className="text-sm font-medium">
              Latest completed market session ·{' '}
              {formatMarketDate(marketMeta?.marketDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:flex">
              <span className={`size-2 rounded-full ${marketMeta && !marketMeta.stale ? 'bg-emerald-500' : 'bg-amber-500'}`} />{' '}
              {settings.provider === 'FREE_EOD'
                ? `${marketMeta?.source ?? 'NSE EOD'} · ${marketMeta ? (marketMeta.stale ? 'Stale' : 'Validated') : 'Unavailable'}`
                : liveQuotes.length
                  ? `${settings.provider === 'KITE_CONNECT' ? 'Zerodha' : 'Groww'} live · ${liveQuotes.length} quotes`
                  : `${settings.provider === 'KITE_CONNECT' ? 'Zerodha' : 'Groww'} waiting · EOD fallback`}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Notifications"
              onClick={() => notify('No new critical alerts.')}
            >
              <Bell />
            </Button>
            <SignOutButton />
          </div>
        </header>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden"
          aria-label="Mobile navigation"
        >
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${view === id ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          {view === 'dashboard' && (
            <DashboardView
              opportunities={opportunities}
              qualified={qualified}
              settings={settings}
              openRisk={openRisk}
              availableCapital={availableCapital}
              openPositions={openTrades.length}
              scanState={scanState}
              onRunScan={runScan}
              onReview={setSelected}
              onViewAll={() => setView('opportunities')}
              marketMeta={marketMeta}
              marketError={marketError}
            />
          )}
          {view === 'opportunities' && (
            <OpportunitiesView
              opportunities={opportunities}
              watchlist={watchlist}
              filter={filter}
              setFilter={setFilter}
              onReview={setSelected}
              onToggleWatch={toggleWatchlist}
            />
          )}
          {view === 'watchlist' && (
            <WatchlistView
              opportunities={opportunities}
              watchlist={watchlist}
              onReview={setSelected}
              onToggleWatch={toggleWatchlist}
              onBrowse={() => setView('opportunities')}
            />
          )}
          {view === 'portfolio' && (
            <PortfolioView
              trades={openTrades}
              openRisk={openRisk}
              settings={settings}
              invested={invested}
              onClose={closeTrade}
            />
          )}
          {view === 'journal' && (
            <JournalView trades={trades} closedTrades={closedTrades} />
          )}
          {view === 'health' && (
            <HealthView
              runs={runs}
              provider={settings.provider}
              onRunScan={runScan}
              scanState={scanState}
              marketMeta={marketMeta}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              value={settingsDraft}
              onChange={setSettingsDraft}
              onSave={saveSettings}
              persistent={persistent}
              scanState={scanState}
              marketMeta={marketMeta}
              onRunScan={runScan}
              brokerConnections={brokerConnections}
              onConnectGroww={connectGroww}
              onDisconnectBroker={disconnectLiveBroker}
              onImportFundamentals={importFundamentals}
            />
          )}
        </div>
      </section>

      <OpportunityDialog
        stock={selected}
        watchlisted={selected ? watchlist.includes(selected.symbol) : false}
        openRisk={openRisk}
        hardRisk={settings.hardRisk}
        onClose={() => setSelected(null)}
        onToggleWatch={toggleWatchlist}
        onCreateTrade={createTrade}
        paperTradeEligible={Boolean(
          selected &&
            (selected.status !== 'Watch' ||
              selected.score >= 70 ||
              getNiftyBullish20(opportunities).some(
                (stock) => stock.symbol === selected.symbol,
              )),
        )}
      />
      {notice && (
        <output className="fixed bottom-5 right-5 z-[80] flex max-w-sm items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl">
          <Check className="size-4 text-emerald-400" />
          {notice}
        </output>
      )}
    </main>
  );
}

function DashboardView({
  opportunities,
  qualified,
  settings,
  openRisk,
  availableCapital,
  openPositions,
  scanState,
  onRunScan,
  onReview,
  onViewAll,
  marketMeta,
  marketError,
}: {
  opportunities: Opportunity[];
  qualified: Opportunity[];
  settings: Settings;
  openRisk: number;
  availableCapital: number;
  openPositions: number;
  scanState: string;
  onRunScan: () => void;
  onReview: (o: Opportunity) => void;
  onViewAll: () => void;
  marketMeta: MarketMeta | null;
  marketError: string | null;
}) {
  const top = opportunities.slice(0, 4);
  const dataHealthy = Boolean(
    marketMeta &&
      !marketMeta.stale &&
      marketMeta.status === 'COMPLETED' &&
      marketMeta.validatedCount >= Math.floor(marketMeta.universeCount * 0.9),
  );
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(125deg,#071b2f_0%,#0b2946_58%,#0f3d3a_100%)] p-6 text-white shadow-[0_24px_70px_rgba(7,27,47,.2)] md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-300">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1">Morning brief</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Clock3 className="size-3.5" /> Last EOD sync {formatIstDateTime(marketMeta?.completedAt)}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-.035em] md:text-4xl">
            {marketError
              ? 'Market scan unavailable.'
              : qualified.length
              ? `${qualified.length} setups deserve attention.`
              : 'No qualified trade today.'}
          </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              Signals use prices and history through the previous completed NSE session for a 3–20 session holding window. This is not an intraday scan.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              size="lg"
              onClick={onRunScan}
              disabled={scanState === 'running'}
              className="h-12 w-full bg-emerald-400 px-5 text-slate-950 shadow-lg shadow-emerald-950/20 hover:bg-emerald-300 lg:w-auto"
            >
              {scanState === 'running' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}{' '}
              {scanState === 'running'
                ? 'Syncing latest NSE EOD…'
                : scanState === 'complete'
                  ? 'EOD sync complete'
                  : 'Sync latest NSE EOD'}
            </Button>
            <p className="mt-2 text-center text-xs text-slate-400 lg:text-right">
              Downloads the latest completed day and rebuilds all scores
            </p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Market regime"
          value={marketMeta?.marketRegime ?? 'Unavailable'}
          note="Nifty 500 50/200-day trend plus universe breadth"
          icon={Gauge}
          tone={marketMeta?.marketRegime === 'Bullish' ? 'emerald' : 'amber'}
        />
        <MetricCard
          label="Qualified setups"
          value={String(qualified.length)}
          note="Hard gates applied before ranking"
          icon={Sparkles}
          tone="blue"
        />
        <MetricCard
          label="Open risk"
          value={money(openRisk)}
          note={`${money(Math.max(0, settings.normalRisk - openRisk))} normal capacity remains`}
          icon={ShieldCheck}
          tone="amber"
        />
        <MetricCard
          label="Available capital"
          value={money(availableCapital)}
          note={`${money(settings.capital)} configured capital`}
          icon={CircleDollarSign}
          tone="slate"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <OpportunityTable
          stocks={top}
          onReview={onReview}
          onViewAll={onViewAll}
        />
        <aside className="space-y-5">
          <article className="rounded-2xl bg-[var(--navy)] p-5 text-white">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Risk capacity</h2>
              <span className="text-xs text-slate-400">Across open trades</span>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <p className="text-3xl font-semibold tracking-tight">
                {money(openRisk)}
              </p>
              <p className="pb-1 text-xs text-slate-400">
                of {money(settings.normalRisk)} normal
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${openRisk > settings.normalRisk ? 'bg-rose-400' : 'bg-amber-400'}`}
                style={{
                  width: `${Math.min(100, (openRisk / settings.hardRisk) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white/[.06] p-3">
                <p className="text-slate-400">Hard ceiling</p>
                <p className="mt-1 font-semibold">{money(settings.hardRisk)}</p>
              </div>
              <div className="rounded-xl bg-white/[.06] p-3">
                <p className="text-slate-400">Open positions</p>
                <p className="mt-1 font-semibold">
                  {openPositions} of {settings.maxPositions}
                </p>
              </div>
            </div>
          </article>
          <article className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Data readiness</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${dataHealthy ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {dataHealthy ? 'Healthy' : 'Review'}
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Latest candle</dt>
                <dd className="font-medium">{formatMarketDate(marketMeta?.marketDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Universe</dt>
                <dd className="font-medium">{marketMeta?.universeCount ?? '—'} symbols</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Validated</dt>
                <dd className="font-medium">
                  {marketMeta ? `${marketMeta.validatedCount} / ${marketMeta.universeCount}` : '—'}
                </dd>
              </div>
            </dl>
          </article>
        </aside>
      </div>
      {(marketError || marketMeta?.warnings?.length) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Evidence requiring review</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {marketError && <li>{marketError}</li>}
            {marketMeta?.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        Research support only. Prices and index evidence come from NSE end-of-day
        archives; fundamentals must be imported with their source date. Confirm
        current price, corporate actions, and orders independently.
      </p>
    </div>
  );
}

function OpportunityTable({
  stocks,
  onReview,
  onViewAll,
}: {
  stocks: Opportunity[];
  onReview: (o: Opportunity) => void;
  onViewAll?: () => void;
}) {
  return (
    <article className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold">Top opportunities</h2>
          <p className="text-xs text-slate-500">
            Ranked technical, quality, regime and catalyst evidence
          </p>
        </div>
        {onViewAll && (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View all <ChevronRight />
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {[
                'Stock',
                'Setup',
                'Score',
                'Trend',
                'Last close',
                'Entry zone',
                'Stop',
                'Risk',
                'Action',
              ].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stocks.map((stock) => (
              <tr key={stock.symbol} className="hover:bg-slate-50/70">
                <td aria-label={`${stock.symbol} stock`} className="px-4 py-4">
                  <div>
                    <p className="font-semibold">{stock.symbol}</p>
                    <p className="text-xs text-slate-500">{stock.sector}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <StatusPill status={stock.status} />
                  <p className="mt-1.5 text-xs text-slate-500">{stock.setup}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {stock.score}
                    </span>
                    <Progress
                      aria-label={`${stock.symbol} composite score ${stock.score} out of 100`}
                      value={stock.score}
                      className="w-14 [&_[data-slot=progress-indicator]]:bg-emerald-500"
                    />
                  </div>
                </td>
                <td className="px-4 py-4 text-emerald-600">
                  <MiniChart values={stock.prices} />
                </td>
                <td className="px-4 py-4 text-sm tabular-nums">
                  {money(stock.close, 2)}
                  <p
                    className={`text-xs ${stock.change >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                  >
                    {stock.change >= 0 ? '+' : ''}
                    {stock.change}%
                  </p>
                </td>
                <td className="px-4 py-4 text-sm tabular-nums">
                  {money(stock.entryLow, 0)}–{money(stock.entryHigh, 0)}
                </td>
                <td className="px-4 py-4 text-sm tabular-nums text-rose-700">
                  {money(stock.stop, 0)}
                </td>
                <td className="px-4 py-4 text-sm font-medium tabular-nums">
                  {money(stock.plannedRisk)}
                </td>
                <td className="px-4 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReview(stock)}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function OpportunitiesView({
  opportunities,
  watchlist,
  filter,
  setFilter,
  onReview,
  onToggleWatch,
}: {
  opportunities: Opportunity[];
  watchlist: string[];
  filter: string;
  setFilter: (v: string) => void;
  onReview: (o: Opportunity) => void;
  onToggleWatch: (s: string) => void;
}) {
  const [explaining, setExplaining] = useState<Opportunity | null>(null);
  const matches = (stock: Opportunity) =>
    !filter ||
    `${stock.symbol} ${stock.name} ${stock.sector}`
      .toLowerCase()
      .includes(filter.toLowerCase());
  const cards = (
    stocks: Opportunity[],
    emptyText: string,
    options?: { ranked?: boolean; paperTrade?: boolean },
  ) => {
    const visible = stocks.filter(matches);
    if (!visible.length) {
      return (
        <EmptyState
          icon={Search}
          title="No stocks in this group"
          text={filter ? 'Try a different stock or sector search.' : emptyText}
        />
      );
    }
    return (
    <div className="grid gap-4 xl:grid-cols-2">
      {visible.map((stock, index) => (
        <article key={stock.symbol} className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.055)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_20px_50px_rgba(15,23,42,.11)]">
          <div className={`absolute inset-x-0 top-0 h-1 ${stock.score >= 70 ? 'bg-emerald-500' : stock.score >= 50 ? 'bg-amber-400' : 'bg-slate-300'}`} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {options?.ranked && (
                  <span className="grid size-7 place-items-center rounded-lg bg-blue-950 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                )}
                <h3 className="text-lg font-semibold">{stock.symbol}</h3>
                <StatusPill status={stock.status} />
              </div>
              <p className="text-sm text-slate-500">
                {stock.name} · {stock.sector}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setExplaining(stock)}
                aria-label={`Explain ${stock.setup} for ${stock.symbol}`}
                className="grid size-9 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
              >
                <Info className="size-4" />
              </button>
              <button
                onClick={() => onToggleWatch(stock.symbol)}
                aria-label={`${watchlist.includes(stock.symbol) ? 'Remove' : 'Add'} ${stock.symbol} ${watchlist.includes(stock.symbol) ? 'from' : 'to'} watchlist`}
                className={`grid size-9 place-items-center rounded-lg border ${watchlist.includes(stock.symbol) ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-slate-200 text-slate-500'}`}
              >
                <Star
                  className={`size-4 ${watchlist.includes(stock.symbol) ? 'fill-current' : ''}`}
                />
              </button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Composite score
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {stock.score}
                <span className="text-sm font-normal text-slate-400">
                  {' '}
                  / 100
                </span>
              </p>
              <p className="mt-2 text-sm font-medium text-emerald-700">
                {stock.setup}
              </p>
              {stock.livePrice !== undefined && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-blue-700">
                  <Radio className="size-3" /> Live {stock.liveProvider === 'KITE_CONNECT' ? 'Zerodha' : 'Groww'} price
                </p>
              )}
            </div>
            <div className="text-emerald-600">
              <MiniChart values={stock.prices} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Day move</p>
              <p className={`mt-1 font-semibold ${currentMove(stock) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {currentMove(stock) >= 0 ? '+' : ''}{currentMove(stock).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Entry</p>
              <p className="mt-1 font-semibold">{money(stock.entryHigh, 0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Stop</p>
              <p className="mt-1 font-semibold text-rose-700">
                {money(stock.stop, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Qty / risk</p>
              <p className="mt-1 font-semibold">
                {stock.quantity} / {money(stock.plannedRisk)}
              </p>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600">
            {stock.thesis}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              className={options?.paperTrade ? '' : 'sm:col-span-2'}
              variant="outline"
              onClick={() => onReview(stock)}
            >
              Open analysis <ChevronRight />
            </Button>
            {options?.paperTrade && (
              <Button onClick={() => onReview(stock)}>
                <BriefcaseBusiness /> Review paper trade
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
    );
  };
  const qualifiedStocks = opportunities.filter((stock) => stock.status !== 'Watch');
  const topScoreStocks = opportunities.filter((stock) => stock.score >= 70);
  const nextScoreStocks = opportunities.filter((stock) => stock.score >= 50 && stock.score < 70);
  const niftyBullish20 = getNiftyBullish20(opportunities);
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f7ff_55%,#ecfdf5_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,.06)]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800"><TrendingUp className="size-4" /> Latest ranked market</div>
            <h1 className="mt-2 page-title">Daily opportunities</h1>
            <p className="page-subtitle">
              Compare validated setups, high-score ideas and the latest Nifty 500 bullish leaders in one place.
            </p>
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search stock or sector"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm shadow-sm outline-none focus:border-emerald-500 sm:w-72"
            />
          </label>
        </div>
      </section>
      <Tabs defaultValue={qualifiedStocks.length ? 'qualified' : topScoreStocks.length ? 'top' : 'next'}>
        <TabsList className="h-auto flex-wrap border border-slate-200 bg-white p-1.5 shadow-sm" variant="default">
          <TabsTrigger value="qualified">Qualified ({qualifiedStocks.length})</TabsTrigger>
          <TabsTrigger value="top">Top score 70+ ({topScoreStocks.length})</TabsTrigger>
          <TabsTrigger value="nifty">Nifty bullish 20 ({niftyBullish20.length})</TabsTrigger>
          <TabsTrigger value="next">Next 50–69 ({nextScoreStocks.length})</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="banks">Banks & financials</TabsTrigger>
          <TabsTrigger value="all">All screened</TabsTrigger>
        </TabsList>
        <TabsContent value="qualified" className="mt-4">
          {cards(qualifiedStocks, 'No stock currently passes every technical, liquidity, market-regime and fundamental quality gate.')}
        </TabsContent>
        <TabsContent value="top" className="mt-4">
          {cards(topScoreStocks, 'No stock currently has a composite score of 70 or more.', { paperTrade: true })}
        </TabsContent>
        <TabsContent value="nifty" className="mt-4">
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <TrendingUp className="mt-0.5 size-4 shrink-0" />
            <p>Top 20 positive movers from the current Nifty 500 scan, ranked by the latest available day-change. A connected broker uses its live change; otherwise the latest NSE EOD change is used. Composite score breaks ties.</p>
          </div>
          {cards(niftyBullish20, 'No positive-moving Nifty 500 candidates are available in the latest scan.', { ranked: true, paperTrade: true })}
        </TabsContent>
        <TabsContent value="next" className="mt-4">
          {cards(nextScoreStocks, 'No developing setup currently has a score between 50 and 69.')}
        </TabsContent>
        <TabsContent value="companies" className="mt-4">
          {cards(opportunities.filter((o) => !o.isBank), 'No company candidates are available in the latest scan.')}
        </TabsContent>
        <TabsContent value="banks" className="mt-4">
          {cards(opportunities.filter((o) => o.isBank), 'No bank or financial candidates are available in the latest scan.')}
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          {cards(opportunities, 'Run the latest NSE EOD sync to build the opportunity list.')}
        </TabsContent>
      </Tabs>
      <SetupInfoDialog stock={explaining} onClose={() => setExplaining(null)} />
    </div>
  );
}

function SetupInfoDialog({ stock, onClose }: { stock: Opportunity | null; onClose: () => void }) {
  if (!stock) return null;
  const explanation = stock.setup === 'Confirmed breakout'
    ? {
        meaning: 'The latest closing price finished above the highest price reached during the previous 20 trading sessions.',
        why: 'This suggests buyers were strong enough to move beyond a level that had repeatedly stopped the price.',
        check: 'After market open, confirm that price stays near or above the breakout level and that volume remains healthy. Do not chase a large gap-up.',
      }
    : stock.setup === 'Pullback opportunity'
      ? {
          meaning: 'The larger trend is still rising, but price has moved back close to its 20-day average.',
          why: 'A controlled pullback can provide a lower-risk entry than buying after a sharp rise.',
          check: 'Look for price to hold the support area and turn upward. A close below support weakens the setup.',
        }
      : stock.setup === 'Momentum continuation'
        ? {
            meaning: 'The stock is already trending upward and momentum indicators remain positive.',
            why: 'Existing buying strength may continue even though a fresh 20-day breakout has not occurred.',
            check: 'Enter only inside the suggested range. Avoid the trade if momentum fades or price falls below support.',
          }
        : {
            meaning: 'The stock has some positive evidence, but it has not completed a reliable entry trigger.',
            why: 'Waiting prevents an early entry before buyers prove that resistance can be crossed.',
            check: 'Keep it on the watchlist and wait for a confirmed breakout or a supported pullback.',
          };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{stock.setup}</DialogTitle>
          <DialogDescription>A simple explanation for {stock.symbol}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">
          <div className="rounded-xl bg-blue-50 p-4"><p className="font-semibold text-blue-900">What it means</p><p className="mt-1 text-blue-950">{explanation.meaning}</p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Why it matters</p><p className="mt-1 text-emerald-950">{explanation.why}</p></div>
          <div className="rounded-xl bg-amber-50 p-4"><p className="font-semibold text-amber-900">What you should check</p><p className="mt-1 text-amber-950">{explanation.check}</p></div>
        </div>
        <DialogFooter><Button onClick={onClose}>Understood</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WatchlistView({
  opportunities,
  watchlist,
  onReview,
  onToggleWatch,
  onBrowse,
}: {
  opportunities: Opportunity[];
  watchlist: string[];
  onReview: (o: Opportunity) => void;
  onToggleWatch: (s: string) => void;
  onBrowse: () => void;
}) {
  const stocks = opportunities.filter((o) => watchlist.includes(o.symbol));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Watchlist</h1>
        <p className="page-subtitle">
          Setups that deserve monitoring but may still be waiting for a trigger.
        </p>
      </div>
      {stocks.length ? (
        <div className="panel overflow-hidden">
          <div className="divide-y divide-slate-100">
            {stocks.map((stock) => (
              <div
                key={stock.symbol}
                className="grid gap-4 p-5 md:grid-cols-[1.1fr_1fr_1fr_auto] md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{stock.symbol}</h3>
                    <StatusPill status={stock.status} />
                  </div>
                  <p className="text-sm text-slate-500">{stock.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">
                    Trigger / entry ceiling
                  </p>
                  <p className="mt-1 font-semibold">
                    {money(stock.entryHigh, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Why waiting</p>
                  <p className="mt-1 text-sm">
                    {stock.status === 'Watch'
                      ? 'Entry condition is not confirmed'
                      : 'Qualified — review opening price'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onReview(stock)}>
                    Review
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleWatch(stock.symbol)}
                    aria-label={`Remove ${stock.symbol}`}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Star}
          title="Your watchlist is clear"
          text="Add qualified or developing setups from Opportunities. The reason for waiting stays visible here."
          action={<Button onClick={onBrowse}>Browse opportunities</Button>}
        />
      )}
    </div>
  );
}

function PortfolioView({
  trades,
  openRisk,
  settings,
  invested,
  onClose,
}: {
  trades: PaperTrade[];
  openRisk: number;
  settings: Settings;
  invested: number;
  onClose: (t: PaperTrade) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Portfolio & risk</h1>
        <p className="page-subtitle">
          Potential loss comes first. Every position is measured against the
          same portfolio limits.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Capital deployed"
          value={money(invested)}
          note={`${Math.round((invested / settings.capital) * 100) || 0}% of configured capital`}
          icon={CircleDollarSign}
          tone="slate"
        />
        <MetricCard
          label="Total open risk"
          value={money(openRisk)}
          note={`${Math.round((openRisk / settings.hardRisk) * 100) || 0}% of hard ceiling`}
          icon={ShieldCheck}
          tone="amber"
        />
        <MetricCard
          label="Open positions"
          value={`${trades.length} / ${settings.maxPositions}`}
          note="New trades block at the maximum"
          icon={BriefcaseBusiness}
          tone="blue"
        />
        <MetricCard
          label="Risk status"
          value={openRisk > settings.normalRisk ? 'Review' : 'Within plan'}
          note={
            openRisk > settings.normalRisk
              ? 'Above normal ceiling'
              : 'Below normal ceiling'
          }
          icon={HeartPulse}
          tone={openRisk > settings.normalRisk ? 'amber' : 'emerald'}
        />
      </div>
      {trades.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="table-head">
              <tr>
                {[
                  'Stock',
                  'Opened',
                  'Entry',
                  'Stop',
                  'Target',
                  'Quantity',
                  'Open risk',
                  'Action',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td className="table-cell font-semibold">
                    {trade.symbol}
                    <p className="text-xs font-normal text-slate-500">
                      {trade.setup}
                    </p>
                  </td>
                  <td className="table-cell">
                    {new Date(trade.openedAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="table-cell">{money(trade.entry, 2)}</td>
                  <td className="table-cell text-rose-700">
                    {money(trade.stop, 2)}
                  </td>
                  <td className="table-cell text-emerald-700">
                    {money(trade.target, 2)}
                  </td>
                  <td className="table-cell">{trade.quantity}</td>
                  <td className="table-cell font-semibold">
                    {money((trade.entry - trade.stop) * trade.quantity)}
                  </td>
                  <td className="table-cell">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onClose(trade)}
                    >
                      Close paper trade
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No open paper positions"
          text="Create a paper trade from a qualified opportunity. The app will enforce quantity, position count, and total open-risk limits."
        />
      )}
    </div>
  );
}

function JournalView({
  trades,
  closedTrades,
}: {
  trades: PaperTrade[];
  closedTrades: PaperTrade[];
}) {
  const pnl = closedTrades.reduce(
    (sum, t) => sum + ((t.exitPrice ?? t.entry) - t.entry) * t.quantity,
    0,
  );
  const journalSeries = [...closedTrades]
    .sort((a, b) =>
      String(a.closedAt ?? '').localeCompare(String(b.closedAt ?? '')),
    )
    .reduce<{ trade: string; pnl: number }[]>((series, trade, index) => {
      const previous = series.at(-1)?.pnl ?? 0;
      const realised = ((trade.exitPrice ?? trade.entry) - trade.entry) * trade.quantity;
      series.push({ trade: `#${index + 1}`, pnl: Number((previous + realised).toFixed(2)) });
      return series;
    }, []);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Journal & performance</h1>
        <p className="page-subtitle">
          Paper outcomes are separated from the backtest and include the
          original plan.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className="panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Paper strategy curve</h2>
              <p className="text-xs text-slate-500">
                Cumulative realised P&amp;L from your closed paper trades
              </p>
            </div>
            <span className={`flex items-center gap-1 text-sm font-semibold ${pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              <ArrowUpRight className="size-4" /> {money(pnl)}
            </span>
          </div>
          {journalSeries.length ? <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={journalSeries}>
                <XAxis
                  dataKey="trade"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }}
                />
                <Line
                  type="monotone"
                  dataKey="pnl"
                  stroke="#059669"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div> : (
            <div className="mt-5 grid h-64 place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">
              Close a paper trade to start the realised P&amp;L curve.
            </div>
          )}
        </article>
        <article className="panel p-5">
          <h2 className="font-semibold">Journal summary</h2>
          <dl className="mt-5 space-y-4">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">All paper trades</dt>
              <dd className="font-semibold">{trades.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Closed trades</dt>
              <dd className="font-semibold">{closedTrades.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Realised paper P&L</dt>
              <dd
                className={`font-semibold ${pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
              >
                {money(pnl)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Validation status</dt>
              <dd className="font-semibold text-amber-700">Collecting data</dd>
            </div>
          </dl>
        </article>
      </div>
      {trades.length ? (
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Trade log</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {trades.map((t) => (
              <div
                key={t.id}
                className="grid gap-2 p-5 sm:grid-cols-[1fr_1fr_1fr_1fr]"
              >
                <div>
                  <p className="font-semibold">{t.symbol}</p>
                  <p className="text-xs text-slate-500">{t.setup}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-medium">{t.status}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Planned risk</p>
                  <p className="mt-1 text-sm font-medium">
                    {money((t.entry - t.stop) * t.quantity)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Outcome</p>
                  <p className="mt-1 text-sm font-medium">
                    {t.exitPrice
                      ? money((t.exitPrice - t.entry) * t.quantity)
                      : 'Open'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Your journal begins with paper trades"
          text="Review at least 30–50 closed paper trades across different regimes before considering real capital."
        />
      )}
    </div>
  );
}

function HealthView({
  runs,
  provider,
  onRunScan,
  scanState,
  marketMeta,
}: {
  runs: ScanRun[];
  provider: string;
  onRunScan: () => void;
  scanState: string;
  marketMeta: MarketMeta | null;
}) {
  const fundamentalsWarning = marketMeta?.warnings.find((warning) =>
    warning.toLowerCase().includes('fundamental'),
  );
  const priceHealthy = Boolean(
    marketMeta && marketMeta.receivedCount >= Math.floor(marketMeta.universeCount * 0.9),
  );
  const historyHealthy = marketMeta?.status === 'COMPLETED';
  const checks = [
    {
      label: 'Price snapshot',
      state: priceHealthy ? 'Healthy' : 'Review',
      detail: marketMeta
        ? `${marketMeta.receivedCount} of ${marketMeta.universeCount} NSE symbols received for ${formatMarketDate(marketMeta.marketDate)}${marketMeta.missingSymbols?.length ? ` · Missing: ${marketMeta.missingSymbols.join(', ')}` : ''}`
        : 'No NSE price snapshot has been saved yet',
    },
    {
      label: 'Indicator history',
      state: historyHealthy ? 'Healthy' : 'Review',
      detail: marketMeta
        ? `${marketMeta.validatedCount} symbols have enough rolling history for validated indicators`
        : 'Run the historical backfill before publishing signals',
    },
    {
      label: 'Fundamentals',
      state: fundamentalsWarning ? 'Review' : marketMeta ? 'Healthy' : 'Review',
      detail: fundamentalsWarning ?? 'Required fundamental fields passed their freshness gates',
    },
    {
      label: 'Source freshness',
      state: marketMeta && !marketMeta.stale ? 'Healthy' : 'Review',
      detail: marketMeta
        ? `${marketMeta.source}; ${marketMeta.stale ? 'the latest snapshot is stale' : 'latest snapshot is within the freshness window'}`
        : 'No source run is available',
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title">Data health</h1>
          <p className="page-subtitle">
            A recommendation is published only when its mandatory evidence is
            valid and reproducible.
          </p>
        </div>
        <Button onClick={onRunScan} disabled={scanState === 'running'}>
          {scanState === 'running' ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <RefreshCw />
          )}{' '}
          Validate and scan
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {checks.map((check) => (
          <article key={check.label} className="panel p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">{check.label}</h2>
                <p className="mt-1 text-sm text-slate-500">{check.detail}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${check.state === 'Healthy' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {check.state}
              </span>
            </div>
          </article>
        ))}
      </div>
      <article className="panel overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Scan history</h2>
          <p className="text-xs text-slate-500">
            Provider, market date, counts, and status are retained for replay.
          </p>
        </div>
        {runs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="table-head">
                <tr>
                  {[
                    'Run time',
                    'Market date',
                    'Provider',
                    'Universe',
                    'Qualified',
                    'Status',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.id ?? i} className="border-t border-slate-100">
                    <td className="table-cell">
                      {new Date(run.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="table-cell">{run.marketDate}</td>
                    <td className="table-cell">{run.provider}</td>
                    <td className="table-cell">{run.universeCount}</td>
                    <td className="table-cell">{run.qualifiedCount}</td>
                    <td className={`table-cell ${run.status === 'COMPLETED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {run.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500">
            No saved scan runs yet. Current provider: {provider}.
          </div>
        )}
      </article>
    </div>
  );
}

function SettingsView({
  value,
  onChange,
  onSave,
  persistent,
  scanState,
  marketMeta,
  onRunScan,
  brokerConnections,
  onConnectGroww,
  onDisconnectBroker,
  onImportFundamentals,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  onSave: () => void;
  persistent: boolean;
  scanState: string;
  marketMeta: MarketMeta | null;
  onRunScan: () => void;
  brokerConnections: BrokerConnectionStatus[];
  onConnectGroww: (accessToken: string) => Promise<void>;
  onDisconnectBroker: (provider: 'KITE_CONNECT' | 'GROWW_CONNECT') => Promise<void>;
  onImportFundamentals: (file: File, sourceUrl: string) => Promise<void>;
}) {
  const [zerodhaDialogOpen, setZerodhaDialogOpen] = useState(false);
  const [growwDialogOpen, setGrowwDialogOpen] = useState(false);
  const [growwToken, setGrowwToken] = useState('');
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [fundamentalFile, setFundamentalFile] = useState<File | null>(null);
  const [fundamentalBusy, setFundamentalBusy] = useState(false);
  const [fundamentalError, setFundamentalError] = useState<string | null>(null);
  const [fundamentalHelpOpen, setFundamentalHelpOpen] = useState(false);
  const [browserAlerts, setBrowserAlerts] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBrowserAlerts(window.localStorage.getItem('swing-signal-browser-alerts') === 'enabled');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const kite = brokerConnections.find((item) => item.provider === 'KITE_CONNECT');
  const groww = brokerConnections.find((item) => item.provider === 'GROWW_CONNECT');
  const zerodhaRedirect = typeof window === 'undefined'
    ? '/api/brokers/zerodha/callback'
    : `${window.location.origin}/api/brokers/zerodha/callback`;
  const numberField = (key: keyof Settings, label: string, help: string) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        min="0"
        value={Number(value[key])}
        onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500"
      />
      <span className="mt-1 block text-xs text-slate-500">{help}</span>
    </label>
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Change capital and risk limits without changing the scoring evidence
          or historical snapshots.
        </p>
      </div>
      {!persistent && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Persistent storage is not available in this preview session. Settings
          still apply until the page reloads.
        </div>
      )}
      <article className="overflow-hidden rounded-3xl border border-emerald-300/30 bg-[linear-gradient(125deg,#071b2f_0%,#0b2946_56%,#075545_100%)] p-6 text-white shadow-[0_24px_70px_rgba(7,27,47,.2)]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <RefreshCw className="size-4" /> NSE end-of-day sync
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Update prices, indicators and bullish rankings</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This is the same NSE EOD pipeline used by the Morning brief. It downloads the latest completed trading session—not live intraday data—then recalculates indicators, rankings and trade plans.
            </p>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[.06] p-3">
                <p className="text-slate-400">Latest market session</p>
                <p className="mt-1 font-semibold text-white">{formatMarketDate(marketMeta?.marketDate)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[.06] p-3">
                <p className="text-slate-400">Last successful sync</p>
                <p className="mt-1 font-semibold text-white">{formatIstDateTime(marketMeta?.completedAt)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">Automatic weekday sync: 10:30 PM IST · Manual sync is safe before your 9 AM review.</p>
          </div>
          <Button
            size="lg"
            onClick={onRunScan}
            disabled={scanState === 'running'}
            className="h-12 shrink-0 bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300"
          >
            {scanState === 'running' ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            {scanState === 'running' ? 'Syncing NSE data…' : 'Sync latest EOD now'}
          </Button>
        </div>
      </article>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="panel p-5">
          <h2 className="font-semibold">Capital & risk</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {numberField(
              'capital',
              'Trading capital (₹)',
              'Dynamic baseline used for capital allocation.',
            )}
            {numberField(
              'perStockRisk',
              'Suggested max risk / stock (₹)',
              'Position size is reduced to stay at or below this amount.',
            )}
            {numberField(
              'normalRisk',
              'Normal total open risk (₹)',
              'Warn when combined open risk exceeds this level.',
            )}
            {numberField(
              'hardRisk',
              'Hard total open risk (₹)',
              'Block any paper trade that would exceed this ceiling.',
            )}
            {numberField(
              'maxPositions',
              'Maximum open positions',
              'Portfolio-wide position count limit.',
            )}
            {numberField(
              'maxSectorAllocation',
              'Maximum sector allocation (%)',
              'Concentration warning threshold.',
            )}
          </div>
        </article>
        <article className="space-y-5">
          <div className="panel p-5">
            <h2 className="font-semibold">Market-data provider</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only one provider can be active. Historical evidence is retained
              when switching.
            </p>
            <div className="mt-5 space-y-3">
              <ProviderCard
                title="Free NSE end-of-day"
                description="Official NSE historical candles. Always active as the safe fallback."
                selected={value.provider === 'FREE_EOD'}
                status="Ready"
                onSelect={() => onChange({ ...value, provider: 'FREE_EOD' })}
              />
              <ProviderCard
                title="Zerodha Kite Connect"
                description="Live price confirmation for the top 50 EOD-ranked stocks. Requires the ₹500 data plan and daily login."
                selected={value.provider === 'KITE_CONNECT'}
                status={!kite?.configured ? 'Setup required' : kite.connected ? 'Connected' : kite?.expired ? 'Session expired' : 'Not connected'}
                onSelect={kite?.connected ? () => onChange({ ...value, provider: 'KITE_CONNECT' }) : undefined}
                action={kite?.connected ? (
                  <Button variant="outline" size="sm" onClick={() => void onDisconnectBroker('KITE_CONNECT')}>Disconnect</Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setZerodhaDialogOpen(true)}>Setup steps</Button>
                    {kite?.configured ? (
                      <Link href="/api/brokers/zerodha/login" className={buttonVariants({ size: 'sm' })}>Connect Zerodha</Link>
                    ) : (
                      <Button size="sm" disabled>Connect Zerodha</Button>
                    )}
                  </div>
                )}
              />
              <ProviderCard
                title="Groww Connect"
                description="Live LTP confirmation for the top 50 stocks using your daily Groww Trading API token."
                selected={value.provider === 'GROWW_CONNECT'}
                status={!groww?.configured ? 'Setup required' : groww.connected ? 'Connected' : groww?.expired ? 'Session expired' : 'Not connected'}
                onSelect={groww?.connected ? () => onChange({ ...value, provider: 'GROWW_CONNECT' }) : undefined}
                action={groww?.connected ? (
                  <Button variant="outline" size="sm" onClick={() => void onDisconnectBroker('GROWW_CONNECT')}>Disconnect</Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGrowwDialogOpen(true)}>Setup steps</Button>
                    <Button size="sm" onClick={() => setGrowwDialogOpen(true)} disabled={!groww?.configured}>Connect Groww</Button>
                  </div>
                )}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Live providers update prices every 30 seconds while this dashboard is open. Historical scoring still comes from validated NSE EOD data.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-950 to-slate-950 p-5 text-white shadow-[0_16px_45px_rgba(30,58,138,.14)]">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><Bell className="size-4 text-blue-300" /> Browser scan alerts</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">Notify this device when a manually started EOD sync finishes. No trading orders are placed.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={async () => {
                  if (typeof Notification === 'undefined') return;
                  if (browserAlerts) {
                    window.localStorage.removeItem('swing-signal-browser-alerts');
                    setBrowserAlerts(false);
                    return;
                  }
                  if (await Notification.requestPermission() === 'granted') {
                    window.localStorage.setItem('swing-signal-browser-alerts', 'enabled');
                    setBrowserAlerts(true);
                  }
                }}
              >
                {browserAlerts ? 'Disable alerts' : 'Enable alerts'}
              </Button>
            </div>
          </div>
        </article>
      </div>
      <article className="panel overflow-hidden">
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-blue-700" />
              <h2 className="font-semibold">Fundamental quality data</h2>
              <button
                type="button"
                onClick={() => setFundamentalHelpOpen(true)}
                aria-label="How to prepare and import the fundamentals CSV"
                className="grid size-8 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
              >
                <Info className="size-4" />
              </button>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Import source-dated market cap, debt/equity, OPM, ROE and sales growth. Banks may also include capital adequacy and NPA values. Scores are rebuilt immediately after a valid import.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Use consolidated figures from a source you are licensed to use. Missing or older-than-190-day evidence stays Watch-only.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="text-sm font-medium">
                Screener saved-screen URL
                <input
                  type="url"
                  value={value.screenerUrl}
                  onChange={(event) => onChange({ ...value, screenerUrl: event.target.value })}
                  placeholder="https://www.screener.in/screens/..."
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
              <a
                href={value.screenerUrl || 'https://www.screener.in/screens/'}
                target="_blank"
                rel="noreferrer"
                className={`${buttonVariants({ variant: 'outline' })} self-end`}
              >
                Open Screener <ExternalLink />
              </a>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Export CSV from this screen, then upload it below. Screener screen export requires Premium; the saved URL does not download data automatically.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                Choose CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    setFundamentalFile(event.target.files?.[0] ?? null);
                    setFundamentalError(null);
                  }}
                />
              </label>
              <span className="text-sm text-slate-500">
                {fundamentalFile?.name ?? 'No file selected'}
              </span>
              <a href="/api/fundamentals/template" download className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">
                <Download className="size-4" /> Download shortlisted CSV
              </a>
              <a href="/fundamentals-template.csv" download className="text-sm font-semibold text-slate-600 hover:underline">
                Blank template
              </a>
            </div>
            <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-950">
              The shortlisted CSV contains the union of Qualified, Score 70+ and Nifty Bullish 20 stocks. Prices, scores, sector and every saved fundamental value are prefilled. Rows marked <strong>needs_fundamental_update = Yes</strong> still need as-of date, market cap, quality ratios and source details before import.
            </p>
            {fundamentalError && <p className="mt-3 text-sm text-rose-700">{fundamentalError}</p>}
          </div>
          <Button
            disabled={!fundamentalFile || fundamentalBusy || scanState === 'running'}
            onClick={async () => {
              if (!fundamentalFile) return;
              setFundamentalBusy(true);
              setFundamentalError(null);
              try {
                await onImportFundamentals(fundamentalFile, value.screenerUrl);
                setFundamentalFile(null);
              } catch (error) {
                setFundamentalError(error instanceof Error ? error.message : 'Fundamentals import failed');
              } finally {
                setFundamentalBusy(false);
              }
            }}
          >
            {fundamentalBusy ? <LoaderCircle className="animate-spin" /> : <Database />}
            {fundamentalBusy ? 'Importing and rescoring…' : 'Import and rebuild scores'}
          </Button>
        </div>
      </article>
      <div className="flex justify-end">
        <Button size="lg" onClick={onSave}>
          Save settings
        </Button>
      </div>
      <Dialog open={growwDialogOpen} onOpenChange={setGrowwDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Set up Groww Trading API</DialogTitle>
            <DialogDescription>
              SwingSignal uses a read-only market quote check in this workflow. It does not place broker orders.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li><strong>1.</strong> Open Groww, sign in, select your profile, open <strong>Settings</strong>, then choose <strong>Trading APIs</strong>.</li>
            <li><strong>2.</strong> Activate the required Trading API subscription if Groww asks for one.</li>
            <li><strong>3.</strong> Choose <strong>Generate API keys</strong>, select <strong>Access Token</strong>, and generate today&apos;s token. Groww access tokens expire daily at 6:00 AM.</li>
            <li><strong>4.</strong> Make sure <code>BROKER_TOKEN_ENCRYPTION_KEY</code> is configured in Vercel. SwingSignal needs it to encrypt the token before storage.</li>
            <li><strong>5.</strong> Paste the access token below, connect, select Groww as the provider, and save Settings.</li>
            <li><strong>6.</strong> Generate and reconnect with a new token after expiry. NSE EOD continues as the fallback when Groww is disconnected.</li>
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
            <span>Official instructions and current API limits</span>
            <a href="https://groww.in/trade-api/docs/curl" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline">Open Groww API docs <ExternalLink className="size-3.5" /></a>
          </div>
          <div className={`rounded-xl border p-3 text-xs leading-relaxed ${groww?.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            Current status: {groww?.configured ? 'secure token encryption is configured; paste today’s token to connect.' : 'BROKER_TOKEN_ENCRYPTION_KEY is missing in Vercel. Add it and redeploy before connecting.'}
          </div>
          <label className="block text-sm font-medium">
            Today&apos;s Groww access token
            <textarea
              value={growwToken}
              onChange={(event) => setGrowwToken(event.target.value)}
              rows={4}
              autoComplete="off"
              spellCheck={false}
              disabled={!groww?.configured}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 font-mono text-sm outline-none focus:border-emerald-500"
              placeholder="Paste the token generated in Groww"
            />
          </label>
          {brokerError && <p className="text-sm text-rose-700">{brokerError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrowwDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!groww?.configured || brokerBusy || growwToken.trim().length < 20}
              onClick={async () => {
                setBrokerBusy(true);
                setBrokerError(null);
                try {
                  await onConnectGroww(growwToken.trim());
                  setGrowwToken('');
                  setGrowwDialogOpen(false);
                } catch (error) {
                  setBrokerError(error instanceof Error ? error.message : 'Groww connection failed');
                } finally {
                  setBrokerBusy(false);
                }
              }}
            >
              {brokerBusy ? <LoaderCircle className="animate-spin" /> : <Radio />}
              {brokerBusy ? 'Checking token…' : 'Connect securely'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={fundamentalHelpOpen} onOpenChange={setFundamentalHelpOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>How to prepare and import fundamentals</DialogTitle>
            <DialogDescription>
              Follow these steps after every new quarterly result cycle. Daily price syncs do not require a new fundamentals file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm leading-relaxed text-slate-700">
            <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <h3 className="font-semibold text-blue-950">1. Download the correct stock list</h3>
              <p className="mt-1 text-blue-900/85">
                Run <strong>Sync latest NSE EOD</strong> first, then click <strong>Download shortlisted CSV</strong>. The file combines Qualified, Score 70+ and Nifty Bullish 20 stocks without duplicate symbols.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-950">2. Open the CSV and identify missing rows</h3>
              <p className="mt-1">
                Open it in Excel or Google Sheets. Keep the header row unchanged. Filter <code>needs_fundamental_update</code> to <strong>Yes</strong>; those are the rows that need research. Columns such as selection group, company, sector, score, price and daily change are information only and are already filled by SwingSignal.
              </p>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <h3 className="font-semibold text-emerald-950">3A. Normal company or NBFC</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-950/85">
                  <li><code>market_cap_cr</code> — market value in ₹ crore</li>
                  <li><code>debt_equity</code> — debt divided by equity</li>
                  <li><code>opm</code> — operating profit margin percentage</li>
                  <li><code>roe</code> — return on equity percentage</li>
                  <li><code>sales_growth</code> — preferably three-year growth percentage</li>
                </ul>
                <p className="mt-2 text-xs text-emerald-900">For NBFCs, debt/equity is evaluated with a separate financial-company threshold.</p>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
                <h3 className="font-semibold text-violet-950">3B. Bank</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-violet-950/85">
                  <li><code>market_cap_cr</code> — market value in ₹ crore</li>
                  <li><code>roe</code> — return on equity percentage</li>
                  <li><code>sales_growth</code> — latest comparable growth percentage</li>
                  <li><code>capital_adequacy</code> — capital adequacy ratio</li>
                  <li><code>gross_npa</code> and <code>net_npa</code> — NPA percentages</li>
                </ul>
                <p className="mt-2 text-xs text-violet-900">Leave debt/equity and OPM blank for banks; the bank quality model does not use them.</p>
              </div>
            </section>

            <section>
              <h3 className="font-semibold text-slate-950">4. Add date and source evidence</h3>
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                <div className="grid gap-1 border-b border-slate-200 bg-slate-50 p-3 sm:grid-cols-[150px_1fr]"><code>as_of_date</code><span>When you verified the figures, written as YYYY-MM-DD, for example 2026-09-06.</span></div>
                <div className="grid gap-1 border-b border-slate-200 p-3 sm:grid-cols-[150px_1fr]"><code>source_name</code><span>The source, such as Moneycontrol, NSE filing, annual report or Screener.in.</span></div>
                <div className="grid gap-1 bg-slate-50 p-3 sm:grid-cols-[150px_1fr]"><code>source_url</code><span>The exact HTTPS page used for that stock. This is strongly recommended for later checking.</span></div>
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-950">5. Use the correct number format</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950/85">
                <li>Enter percentages as plain numbers: use <strong>21.5</strong>, not <strong>21.5%</strong> and not <strong>0.215</strong>.</li>
                <li>Use market capitalisation in ₹ crore, not raw rupees or ₹ lakh.</li>
                <li>Do not add currency symbols, commas inside numbers, formulas or duplicate symbol/date rows.</li>
                <li>Do not guess missing values. Leave an optional cell blank until it can be verified.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-950">6. Save and import</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Save or download the sheet as a UTF-8 CSV file smaller than 2 MB.</li>
                <li>Return here and click <strong>Choose CSV</strong>.</li>
                <li>Click <strong>Import and rebuild scores</strong>.</li>
                <li>Wait for the EOD scoring rebuild to finish, then review Qualified and the other opportunity tabs.</li>
              </ol>
            </section>

            <div className="rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
              Example company row: INFY · 2026-09-06 · market cap 650000 · D/E 0.10 · OPM 21.5 · ROE 29.4 · sales growth 8.2
            </div>
          </div>
          <DialogFooter>
            <a href="/api/fundamentals/template" download className={buttonVariants({ variant: 'outline' })}><Download /> Download shortlisted CSV</a>
            <Button onClick={() => setFundamentalHelpOpen(false)}>Understood</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={zerodhaDialogOpen} onOpenChange={setZerodhaDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Set up Zerodha Kite Connect</DialogTitle>
            <DialogDescription>
              API credentials stay in Vercel and are never entered into this web page.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li><strong>1.</strong> Subscribe to Kite Connect and create an app in the Zerodha developer console.</li>
            <li><strong>2.</strong> Set the app redirect URL exactly to:</li>
          </ol>
          <div className="break-all rounded-xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">{zerodhaRedirect}</div>
          <ol start={3} className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li><strong>3.</strong> Add <code>KITE_API_KEY</code> and <code>KITE_API_SECRET</code> as Production environment variables in Vercel.</li>
            <li><strong>4.</strong> Redeploy once, return here, and click Connect Zerodha.</li>
            <li><strong>5.</strong> Complete Zerodha login each trading day; the access token expires daily.</li>
            <li><strong>6.</strong> Select Zerodha and save Settings. If login expires, NSE EOD remains the fallback.</li>
          </ol>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Current status: {kite?.configured ? 'server credentials are configured; you can connect.' : 'KITE_API_KEY or KITE_API_SECRET is still missing in Vercel.'}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZerodhaDialogOpen(false)}>Close</Button>
            {kite?.configured && <Link href="/api/brokers/zerodha/login" className={buttonVariants()}>Connect Zerodha</Link>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProviderCard({
  title,
  description,
  selected,
  status,
  onSelect,
  action,
}: {
  title: string;
  description: string;
  selected: boolean;
  status: string;
  onSelect?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <article className={`rounded-xl border p-4 transition ${selected ? 'border-emerald-500 bg-emerald-50/70 shadow-[0_8px_24px_rgba(16,185,129,.08)]' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <button aria-label={`Select ${title} provider`} type="button" onClick={onSelect} disabled={!onSelect} className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default">
          <span className={`mt-1 size-4 shrink-0 rounded-full border-4 ${selected ? 'border-emerald-500' : 'border-slate-300'}`} />
          <span>
            <span className="block font-semibold">{title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
          </span>
        </button>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${status === 'Ready' || status === 'Connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          {status}
        </span>
      </div>
      {action && <div className="mt-3 flex justify-end">{action}</div>}
    </article>
  );
}

function OpportunityDialog({
  stock,
  watchlisted,
  openRisk,
  hardRisk,
  onClose,
  onToggleWatch,
  onCreateTrade,
  paperTradeEligible,
}: {
  stock: Opportunity | null;
  watchlisted: boolean;
  openRisk: number;
  hardRisk: number;
  onClose: () => void;
  onToggleWatch: (s: string) => void;
  onCreateTrade: (o: Opportunity) => void;
  paperTradeEligible: boolean;
}) {
  if (!stock) return null;
  const support = Number.isFinite(stock.support)
    ? stock.support
    : Math.min(...stock.prices.slice(-20));
  const resistance = Number.isFinite(stock.resistance)
    ? stock.resistance
    : Math.max(...stock.prices.slice(-20));
  const blocked =
    !paperTradeEligible ||
    stock.quantity < 1 ||
    openRisk + stock.plannedRisk > hardRisk;
  return (
    <Dialog open={Boolean(stock)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">
              {stock.symbol} · {stock.name}
            </DialogTitle>
            <StatusPill status={stock.status} />
          </div>
          <DialogDescription>
            {stock.sector} · {stock.setup} · EOD {formatMarketDate(stock.asOfDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
          <div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Bullish evidence
              </p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-950">
                {stock.thesis}
              </p>
            </div>
            <div className="mt-4 rounded-xl bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Invalidation / caution
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-950">
                {stock.caution}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 text-white">
            <p className="text-xs text-slate-400">Composite score</p>
            <p className="mt-1 text-4xl font-semibold">{stock.score}</p>
            <div className="mt-4 text-emerald-400">
              <MiniChart values={stock.prices} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Quality {stock.qualityScore.toFixed(1)} / 20
            </p>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Score evidence</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {stock.breakdown.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 p-3"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="font-semibold">
                    {item.value.toFixed(1)} / {item.max}
                  </span>
                </div>
                <Progress
                  aria-label={`${item.label} ${item.value} out of ${item.max}`}
                  value={(item.value / item.max) * 100}
                  className="mt-2 [&_[data-slot=progress-indicator]]:bg-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Risk-defined trade plan</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [
                'Entry zone',
                `${money(stock.entryLow, 2)}–${money(stock.entryHigh, 2)}`,
              ],
              ['Stop', money(stock.stop, 2)],
              ['Support', money(support, 2)],
              ['Resistance', money(resistance, 2)],
              ['Target 1', money(stock.target1, 2)],
              ['Target 2', money(stock.target2, 2)],
              ['Quantity', `${stock.quantity} shares`],
              ['Capital', money(stock.capitalRequired)],
              ['Max loss', money(stock.plannedRisk)],
              ['Reward:risk', `${stock.rewardRisk.toFixed(1)} : 1`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold text-blue-950">Support · {money(support, 2)}</p>
            <p className="mt-1 leading-relaxed text-blue-900/80">
              A recent price area where buyers returned. A daily close below it weakens the bullish setup; always follow the planned stop.
            </p>
          </div>
          <div>
            <p className="font-semibold text-blue-950">Resistance · {money(resistance, 2)}</p>
            <p className="mt-1 leading-relaxed text-blue-900/80">
              The recent ceiling. A close above it with stronger volume is the confirmation used for a breakout setup.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
          <span>
            {stock.marketCapCr === null
              ? 'Market cap unavailable'
              : `Market cap ${money(stock.marketCapCr * 10000000)}`}
            {' · '}ROE {stock.roe === null ? 'unavailable' : `${stock.roe}%`} ·{' '}
            {stock.isBank
              ? `Bank model · CAR ${stock.capitalAdequacy ?? 'unavailable'}% · Gross/Net NPA ${stock.grossNpa ?? 'unavailable'}%/${stock.netNpa ?? 'unavailable'}%`
              : stock.isNbfc
                ? `NBFC model · D/E ${stock.debtEquity ?? 'unavailable'}`
                : `D/E ${stock.debtEquity ?? 'unavailable'} · OPM ${stock.opm === null ? 'unavailable' : `${stock.opm}%`}`}
          </span>
          <a
            href={`https://www.tradingview.com/chart/?symbol=NSE%3A${encodeURIComponent(stock.symbol)}`}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 font-medium text-blue-700"
          >
            Chart <ExternalLink className="size-3.5" />
          </a>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onToggleWatch(stock.symbol)}>
            <Star
              className={watchlisted ? 'fill-current text-amber-500' : ''}
            />
            {watchlisted ? 'Remove watchlist' : 'Add watchlist'}
          </Button>
          <Button disabled={blocked} onClick={() => onCreateTrade(stock)}>
            {blocked
              ? !paperTradeEligible
                ? 'Paper trade from Top 70+ or Nifty 20'
                : 'Risk limit blocks entry'
              : 'Create paper trade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
