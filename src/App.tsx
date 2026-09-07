import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy, Moon, Sun } from "lucide-react";
import { isSceneId, scenes } from "./app/sceneRegistry";
import type { SceneId, ThemeMode } from "./app/types";
import { IconButton } from "./components/ui/IconButton";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  decodeExperiment,
  validateExperiment,
  sceneKey,
  type Experiment,
} from "./app/experiments";
import { queueStageView } from "./app/stageSession";

function sceneFromHash(): SceneId {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0]!;
  return isSceneId(value) ? value : "transform";
}

export function App() {
  const [restoring, setRestoring] = useState(
    window.location.hash.includes("?experiment="),
  );
  const [sceneRevision, setSceneRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const importRevision = useRef(0);
  const [activeScene, setActiveScene] = useState<SceneId>(sceneFromHash);
  const navigationRef = useRef<HTMLElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const pendingPageScrollRef = useRef<{ left: number; top: number } | null>(
    null,
  );
  const [theme, setTheme] = useLocalStorage<ThemeMode>(
    "basis-lab:theme",
    "light",
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let disposed = false;
    const restore = async (promise: Promise<Experiment>) => {
      const revision = ++importRevision.current;
      setRestoring(true);
      try {
        const experiment = await promise;
        if (disposed || revision !== importRevision.current) return;
        localStorage.setItem(
          sceneKey(experiment.scene),
          JSON.stringify(experiment.state),
        );
        queueStageView(experiment.scene, experiment.view);
        setActiveScene(experiment.scene);
        setSceneRevision((value) => value + 1);
        window.history.replaceState(null, "", `#${experiment.scene}`);
        setNotice(`已载入：${experiment.name}`);
      } catch (error) {
        if (!disposed && revision === importRevision.current)
          setNotice(
            error instanceof Error
              ? error.message
              : "实验载入失败，原参数保持。",
          );
      } finally {
        if (!disposed && revision === importRevision.current)
          setRestoring(false);
      }
    };
    const fromHash = () => {
      const query = window.location.hash.split("?")[1];
      const encoded = new URLSearchParams(query).get("experiment");
      if (encoded) void restore(decodeExperiment(encoded));
      else {
        importRevision.current++;
        setRestoring(false);
      }
    };
    const fromEvent = (event: Event) => {
      void restore(validateExperiment((event as CustomEvent).detail));
    };
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("basis-open-experiment", fromEvent);
    fromHash();
    return () => {
      disposed = true;
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("basis-open-experiment", fromEvent);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101413" : "#f4f6f4");
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => {
      pendingPageScrollRef.current = {
        left: window.scrollX,
        top: window.scrollY,
      };
      setActiveScene(sceneFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    if (!window.location.hash)
      window.history.replaceState(null, "", "#transform");
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  const current = useMemo(
    () => scenes.find((scene) => scene.id === activeScene) ?? scenes[1]!,
    [activeScene],
  );

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    const activeButton = navigation?.querySelector<HTMLElement>(
      `[data-scene-id="${activeScene}"]`,
    );
    const centerNavigation = () => {
      if (!navigation || !activeButton) return;
      const navigationRect = navigation.getBoundingClientRect();
      const activeRect = activeButton.getBoundingClientRect();
      const activeCenter =
        navigation.scrollLeft +
        activeRect.left -
        navigationRect.left +
        activeRect.width / 2;
      const maximumScroll = Math.max(
        0,
        navigation.scrollWidth - navigation.clientWidth,
      );
      const targetLeft = Math.min(
        maximumScroll,
        Math.max(0, activeCenter - navigation.clientWidth / 2),
      );

      navigation.scrollTo({
        left: targetLeft,
        top: navigation.scrollTop,
        behavior: "auto",
      });
    };
    centerNavigation();
    const navigationObserver = new ResizeObserver(centerNavigation);
    if (navigation) navigationObserver.observe(navigation);

    let restoreFrame = 0;
    let contentObserver: MutationObserver | null = null;
    const restorePageScroll = () => {
      const pendingPageScroll = pendingPageScrollRef.current;
      if (!pendingPageScroll || restoreFrame) return;
      restoreFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ ...pendingPageScroll, behavior: "auto" });
        pendingPageScrollRef.current = null;
        contentObserver?.disconnect();
      });
    };
    const sceneIsReady = () =>
      Boolean(
        appContentRef.current?.querySelector(`[data-module="${activeScene}"]`),
      );

    if (pendingPageScrollRef.current) {
      if (sceneIsReady()) {
        restorePageScroll();
      } else if (appContentRef.current) {
        contentObserver = new MutationObserver(() => {
          if (sceneIsReady()) restorePageScroll();
        });
        contentObserver.observe(appContentRef.current, {
          childList: true,
          subtree: true,
        });
      }
    }

    return () => {
      navigationObserver.disconnect();
      contentObserver?.disconnect();
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [activeScene]);

  const selectScene = (id: SceneId) => {
    importRevision.current++;
    setRestoring(false);
    pendingPageScrollRef.current = {
      left: window.scrollX,
      top: window.scrollY,
    };
    setActiveScene(id);
    window.history.pushState(null, "", `#${id}`);
  };

  const copyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.hash = activeScene;
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setNotice("未能写入剪贴板，请使用浏览器地址栏复制场景链接。");
    }
  };

  const ActiveScene = current.component;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="基域线性代数实验台">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="brand__name">基域</span>
          <span className="brand__latin">BASIS LAB</span>
        </div>
        <div className="header-context">
          <span>R / C</span>
          <span>线性代数 · 从观察到理解</span>
        </div>
        <div className="header-actions">
          <IconButton
            label={copied ? "链接已复制" : "复制当前场景链接"}
            onClick={copyLink}
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </IconButton>
          <IconButton
            label={theme === "light" ? "切换深色主题" : "切换浅色主题"}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </IconButton>
        </div>
      </header>

      <nav ref={navigationRef} className="scene-nav" aria-label="线性代数主题">
        <div className="scene-nav__inner">
          {scenes.map((scene) => (
            <button
              type="button"
              key={scene.id}
              className="scene-nav__item"
              data-scene-id={scene.id}
              data-active={activeScene === scene.id || undefined}
              aria-current={activeScene === scene.id ? "page" : undefined}
              onClick={() => selectScene(scene.id)}
            >
              <span>{scene.index}</span>
              <b>{scene.label}</b>
            </button>
          ))}
        </div>
      </nav>

      {notice && (
        <div className="app-notice" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="关闭通知"
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={appContentRef}
        className="app-content"
        key={`${current.id}-${sceneRevision}`}
      >
        <Suspense
          fallback={
            <main className="scene-loading-view" role="status">
              <span>正在装载计算模块</span>
              <i aria-hidden="true" />
            </main>
          }
        >
          {restoring ? (
            <div className="stage-loading" role="status">
              正在验证并载入实验…
            </div>
          ) : (
            <ActiveScene theme={theme} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
