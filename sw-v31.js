self.addEventListener('notificationclick', event => {
  event.notification.close();
  const view = event.notification.data?.view;
  const targetUrl = new URL('./', self.location.href);
  if (view === 'timer' || view === 'water') targetUrl.searchParams.set('view', view);

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if (view) client.postMessage({ type: 'studyverse-open-view', view });
      return;
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
