import Navbar from './Navbar';

export default function AccountFlow(props) {
  return (
    <>
      <Navbar />
      <main class="account-flow-page">
        <section class="surface account-flow-card">
          {props.children}
        </section>
      </main>
    </>
  );
}

export function StatusMark(props) {
  return (
    <span class={`account-status-mark is-${props.tone || 'info'}`} aria-hidden="true">
      {props.children}
    </span>
  );
}
