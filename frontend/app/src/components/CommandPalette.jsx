import { useNavigate } from '@solidjs/router';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import {
  buildCommandPaletteCommands,
  filterCommandPaletteCommands,
  isEditableTarget,
} from '../utils/commandPalette';

const OPEN_EVENT = 'media:command-palette:open';

function CommandIcon(props) {
  const icons = {
    home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    compose: <><path d="M12 5v14M5 12h14" /><rect x="3" y="3" width="18" height="18" rx="5" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M9.8 21h4.4" /></>,
    saved: <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" />,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    connections: <><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 7h5m-2.5-2.5v5" /></>,
    safety: <><path d="M12 3 4.5 6v5.5c0 4.8 3 7.9 7.5 9.5 4.5-1.6 7.5-4.7 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
    moderation: <><path d="M12 3 4.5 6v5.5c0 4.8 3 7.9 7.5 9.5 4.5-1.6 7.5-4.7 7.5-9.5V6L12 3Z" /><path d="M9 12h6M12 9v6" /></>,
    login: <><path d="M14 5h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" /><path d="m9 8 4 4-4 4m4-4H3" /></>,
    theme: <><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" /><path d="M17.5 3.5v3m-1.5-1.5h3" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1.1.9-1.1 1.8m0 3.5v.01" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.01" /></>,
    guidelines: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M14 3v4h4M9 11h6m-6 4h6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        {icons[props.name] || icons.search}
      </g>
    </svg>
  );
}

export default function CommandPalette() {
  const auth = useAuth();
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [activeIndex, setActiveIndex] = createSignal(0);
  let dialog;
  let searchInput;
  let previouslyFocused;

  const commands = createMemo(() => buildCommandPaletteCommands({
    authenticated: auth.isAuthenticated(),
    userId: auth.user()?.id || '',
    role: auth.user()?.role || '',
  }));
  const filteredCommands = createMemo(() => filterCommandPaletteCommands(commands(), query()));
  const activeCommand = () => filteredCommands()[activeIndex()] || null;
  const activeOptionId = () => activeCommand() ? `command-option-${activeCommand().id}` : undefined;

  const showPalette = () => {
    if (open()) return;
    previouslyFocused = document.activeElement;
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
    document.body.classList.add('command-palette-open');
    window.requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
  };

  const closePalette = ({ restoreFocus = true } = {}) => {
    if (!open()) return;
    setOpen(false);
    document.body.classList.remove('command-palette-open');
    if (restoreFocus && typeof previouslyFocused?.focus === 'function') {
      window.requestAnimationFrame(() => previouslyFocused?.focus({ preventScroll: true }));
    }
  };

  const focusRoute = (selector = '#route-content') => {
    window.setTimeout(() => document.querySelector(selector)?.focus({ preventScroll: true }), 100);
  };

  const runCommand = (command) => {
    if (!command) return;

    if (command.action === 'toggle-theme') {
      toggleTheme();
      closePalette();
      return;
    }

    closePalette({ restoreFocus: false });
    if (command.action === 'compose') {
      navigate('/');
      focusRoute('#new-post-content');
      return;
    }

    if (command.path) {
      navigate(command.path);
      focusRoute();
    }
  };

  const moveSelection = (direction) => {
    const count = filteredCommands().length;
    if (!count) return;
    setActiveIndex((current) => (current + direction + count) % count);
  };

  const trapFocus = (event) => {
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Enter' && event.target === searchInput && !event.isComposing) {
      event.preventDefault();
      runCommand(activeCommand());
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  };

  createEffect(() => {
    query();
    commands();
    setActiveIndex(0);
  });

  createEffect(() => {
    if (!open()) return;
    const optionId = activeOptionId();
    if (!optionId) return;
    window.queueMicrotask(() => document.getElementById(optionId)?.scrollIntoView({ block: 'nearest' }));
  });

  onMount(() => {
    const handleOpenEvent = () => showPalette();
    const handleGlobalKeyDown = (event) => {
      if (
        event.defaultPrevented
        || event.repeat
        || isEditableTarget(event.target)
        || event.altKey
        || event.shiftKey
      ) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        showPalette();
      }
    };

    window.addEventListener(OPEN_EVENT, handleOpenEvent);
    window.addEventListener('keydown', handleGlobalKeyDown);
    onCleanup(() => {
      window.removeEventListener(OPEN_EVENT, handleOpenEvent);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      document.body.classList.remove('command-palette-open');
    });
  });

  return (
    <Show when={open()}>
      <Portal>
        <div
          class="command-palette-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePalette();
          }}
        >
          <section
            ref={dialog}
            class="command-palette surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            aria-describedby="command-palette-description"
            onKeyDown={handleDialogKeyDown}
          >
            <div class="command-palette-heading">
              <div>
                <p class="sidebar-eyebrow">Comenzi rapide</p>
                <h2 id="command-palette-title">Unde vrei să ajungi?</h2>
                <p id="command-palette-description" class="sr-only">Caută o comandă, apoi folosește săgețile și tasta Enter pentru a o deschide.</p>
              </div>
              <button type="button" class="icon-button" onClick={() => closePalette()} aria-label="Închide paleta de comenzi">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" /></svg>
              </button>
            </div>

            <div class="command-palette-search">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" /><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              <input
                ref={searchInput}
                type="search"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder="Caută pagini și acțiuni…"
                autocomplete="off"
                autocapitalize="none"
                spellcheck={false}
                role="combobox"
                aria-label="Caută o comandă"
                aria-controls="command-palette-results"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId()}
              />
              <Show when={query()}>
                <button type="button" onClick={() => setQuery('')} aria-label="Șterge căutarea">Șterge</button>
              </Show>
            </div>

            <div id="command-palette-results" class="command-palette-results" role="listbox" aria-label="Comenzi disponibile">
              <Show
                when={filteredCommands().length > 0}
                fallback={
                  <div class="command-palette-empty" role="status">
                    <span aria-hidden="true">⌕</span>
                    <strong>Nicio comandă găsită</strong>
                    <p>Încearcă un termen mai scurt, precum „profil”, „siguranță” sau „ajutor”.</p>
                  </div>
                }
              >
                <For each={filteredCommands()}>{(command, index) => (
                  <button
                    id={`command-option-${command.id}`}
                    type="button"
                    class={`command-palette-option ${index() === activeIndex() ? 'is-active' : ''}`}
                    role="option"
                    aria-selected={index() === activeIndex()}
                    onMouseEnter={() => setActiveIndex(index())}
                    onClick={() => runCommand(command)}
                  >
                    <span class="command-palette-option-icon"><CommandIcon name={command.icon} /></span>
                    <span class="command-palette-option-copy">
                      <strong>{command.title}</strong>
                      <small>{command.description}</small>
                    </span>
                    <span class="command-palette-option-group">{command.group}</span>
                    <svg class="command-palette-option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                )}</For>
              </Show>
            </div>

            <footer class="command-palette-footer" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigare</span>
              <span><kbd>Enter</kbd> deschide</span>
              <span><kbd>Esc</kbd> închide</span>
            </footer>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
