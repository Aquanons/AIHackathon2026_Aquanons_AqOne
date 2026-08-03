export function connect(callbacks) {
  const { onEvent, onStatus, onPoll } = callbacks;
  const token = sessionStorage.getItem('aqoneToken');
  let errors = 0;
  let pollTimer = null;
  let source = null;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    onStatus('polling');
    pollTimer = setInterval(async () => {
      try { await onPoll(); } catch {}
    }, 10000);
  }

  function open() {
    source = new EventSource(`/api/sos/stream?token=${encodeURIComponent(token)}`);
    source.onopen = () => {
      errors = 0;
      onStatus('live');
    };
    source.onerror = () => {
      errors += 1;
      if (errors >= 2) {
        source.close();
        startPolling();
      } else {
        onStatus('reconnecting');
      }
    };
    source.addEventListener('sos.created', (e) => onEvent('created', JSON.parse(e.data)));
    source.addEventListener('sos.acknowledged', (e) => onEvent('acknowledged', JSON.parse(e.data)));
  }

  open();

  return {
    close() {
      if (source) source.close();
      stopPolling();
    },
  };
}
