// 旧入口迁移：把 fisharchive.pages.dev 的访问 301 到 fisharchive.cc，保留路径和查询串。
// 只精确匹配生产域名，预览部署（<hash>.fisharchive.pages.dev）与分支别名不受影响。
// 之所以用 Functions 中间件：Pages 的 _redirects 不能按 hostname 匹配，
// 而 pages.dev 属于 Cloudflare 自己的 zone，无法在控制台建 Redirect Rule。
// 图片等静态资源已在 _routes.json 里排除：它们不触发 Functions，
// 免得一次瀑布流浏览就把 Functions 免费额度（10 万次/天）吃掉。
export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);

  if (url.hostname === 'fisharchive.pages.dev') {
    url.protocol = 'https:';
    url.hostname = 'fisharchive.cc';
    return Response.redirect(url.toString(), 301);
  }

  return next();
};
