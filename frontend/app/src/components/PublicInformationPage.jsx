import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import Navbar from './Navbar';
import PageMeta from './PageMeta';
import SiteFooter from './SiteFooter';

export default function PublicInformationPage(props) {
  return (
    <>
      <PageMeta
        title={props.metaTitle}
        description={props.description}
        canonicalPath={props.canonicalPath}
        schemaType="WebPage"
      />
      <Navbar />
      <main class="public-page" id="main-content">
        <section class="public-hero public-hero-compact app-container" aria-labelledby="information-title">
          <p class="eyebrow">{props.eyebrow}</p>
          <h1 id="information-title">{props.title}</h1>
          <p>{props.introduction}</p>
          <p class="information-updated">Actualizat la {props.updatedAt}</p>
        </section>

        <section class="public-section app-container information-layout">
          <nav class="surface information-toc" aria-label={`Cuprins ${props.eyebrow.toLowerCase()}`}>
            <p class="sidebar-eyebrow">Pe această pagină</p>
            <For each={props.sections}>
              {(section, index) => <a href={`#${section.id}`}>{String(index() + 1).padStart(2, '0')} · {section.title}</a>}
            </For>
          </nav>

          <div class="information-sections">
            <Show when={props.notice}>
              <aside class="information-notice" aria-label="Notă importantă">
                <strong>{props.notice.title}</strong>
                <p>{props.notice.copy}</p>
              </aside>
            </Show>

            <For each={props.sections}>
              {(section, index) => (
                <article class="surface information-card" id={section.id}>
                  <span aria-hidden="true">{String(index() + 1).padStart(2, '0')}</span>
                  <div>
                    <h2>{section.title}</h2>
                    <For each={section.paragraphs}>{(paragraph) => <p>{paragraph}</p>}</For>
                    <Show when={section.items?.length}>
                      <ul>
                        <For each={section.items}>{(item) => <li>{item}</li>}</For>
                      </ul>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>
        </section>

        <section class="public-section app-container">
          <div class="surface public-callout">
            <div>
              <p class="sidebar-eyebrow">{props.callout.eyebrow}</p>
              <h2>{props.callout.title}</h2>
              <p>{props.callout.copy}</p>
            </div>
            <div class="information-actions">
              <For each={props.callout.actions}>
                {(action) => <A href={action.href} class={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`}>{action.label}</A>}
              </For>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
