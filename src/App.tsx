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

function sceneFromHash(): SceneId {
  const value = window.location.hash.replace(/^#\/?/, "");
  return isSceneId(value) ? value : "transform";
}

export function App() {
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
    if (navigation && activeButton) {
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
    }

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
      contentObserver?.disconnect();
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [activeScene]);

  const selectScene = (id: SceneId) => {
    pendingPageScrollRef.current = {
      left: window.scrollX,
      top: window.scrollY,
    };
    setActiveScene(id);
    window.history.pushState(null, "", `#${id}`);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
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
          <span>1–3D MATRIX WORKBENCH · v1.2.0-beta.2 · 待进一步测试优化</span>
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

      <div ref={appContentRef} className="app-content" key={current.id}>
        <Suspense
          fallback={
            <main className="scene-loading-view" role="status">
              <span>正在装载计算模块</span>
              <i aria-hidden="true" />
            </main>
          }
        >
          <ActiveScene theme={theme} />
        </Suspense>
      </div>
    </div>
  );
}
