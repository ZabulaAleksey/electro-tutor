package dev.electrotutor.app;
import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.*;

/** Bundled responsive Astro app. No JavaScript bridge, file URL access or TLS exceptions. */
public class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net";
  private WebView web; private FrameLayout root; private View fullscreen; private WebChromeClient.CustomViewCallback fullscreenCallback;
  private ValueCallback<Uri[]> chooser;
  private byte[] pendingExport;
  private boolean exporting=false;
  private WebResourceResponse asset(Uri uri) {
    if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
    String path=uri.getPath(); if(path==null)path="/"; if(path.contains("..")||path.indexOf('\\')>=0)return new WebResourceResponse("text/plain","UTF-8",400,"Bad path",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    if(path.endsWith("/"))path+="index.html";
    String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".wasm")?"application/wasm":path.endsWith(".css")?"text/css":path.endsWith(".html")?"text/html":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".json")||path.endsWith(".webmanifest")?"application/json":path.endsWith(".png")?"image/png":path.endsWith(".woff2")?"font/woff2":"application/octet-stream";
    try { return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","public, max-age=0"),getAssets().open("site"+path)); }
    catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream("Not found".getBytes()));}
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);root=new FrameLayout(this);web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
    getWindow().setStatusBarColor(0xff101a2a);getWindow().setNavigationBarColor(0xff101a2a);
    root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setBuiltInZoomControls(false);settings.setDisplayZoomControls(false);settings.setSupportZoom(false);settings.setMediaPlaybackRequiresUserGesture(true);
    WebView.setWebContentsDebuggingEnabled(true);
    ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){return asset(r.getUrl());}});
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest r){return asset(r.getUrl());}
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost()))return false;if("https".equals(uri.getScheme())&&"electrotutor.pages.dev".equals(uri.getHost())){view.loadUrl("https://"+HOST+uri.getEncodedPath()+(uri.getEncodedQuery()==null?"":"?"+uri.getEncodedQuery())+(uri.getEncodedFragment()==null?"":"#"+uri.getEncodedFragment()));return true;}if(request.hasGesture()&&"https".equals(uri.getScheme()))new AlertDialog.Builder(MainActivity.this).setMessage("Открыть внешний сайт: "+uri.getHost()+"?").setPositiveButton("Открыть",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException ignored){}}).setNegativeButton("Отмена",null).show();return true;}
    });
    web.setDownloadListener((url,agent,disposition,mime,length)->exportBlob(url,mime));
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onJsBeforeUnload(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage("Есть несохранённые изменения. Покинуть страницу?").setPositiveButton("Выйти",(d,w)->result.confirm()).setNegativeButton("Остаться",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
      @Override public void onShowCustomView(View view,CustomViewCallback cb){fullscreen=view;fullscreenCallback=cb;web.setVisibility(View.GONE);root.addView(view,new FrameLayout.LayoutParams(-1,-1));getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);}
      @Override public void onHideCustomView(){leaveFullscreen();}
      @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> result,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=result;try{Intent intent=params.createIntent();intent.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(intent,10);}catch(ActivityNotFoundException e){chooser.onReceiveValue(null);chooser=null;}return true;}
    });
    if(state==null||web.restoreState(state)==null)web.loadUrl("https://"+HOST+"/ru/");
  }
  private void leaveFullscreen(){if(fullscreen==null)return;root.removeView(fullscreen);fullscreen=null;web.setVisibility(View.VISIBLE);getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);if(fullscreenCallback!=null){fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}}
  @Override public void onBackPressed(){if(fullscreen!=null){leaveFullscreen();return;}if(web.canGoBack()){web.goBack();return;}super.onBackPressed();}
  @Override public void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
  private void exportBlob(String url,String mime){
    if(exporting||!url.startsWith("blob:https://"+HOST+"/"))return;
    exporting=true;final String key="__electrotutorExport"+System.currentTimeMillis();
    String quoted=org.json.JSONObject.quote(url),name=org.json.JSONObject.quote(key);
    web.evaluateJavascript("(async()=>{try{const b=await(await fetch("+quoted+")).blob();if(b.size>2000000)throw Error();const r=new FileReader();r.onload=()=>window["+name+"]=r.result;r.readAsDataURL(b);}catch{window["+name+"]=\"error\";}})()",null);
    pollExport(key,mime,0);
  }
  private void pollExport(String key,String mime,int attempts){
    if(attempts>40){exporting=false;Toast.makeText(this,"Не удалось подготовить экспорт",Toast.LENGTH_LONG).show();return;}
    web.postDelayed(()->web.evaluateJavascript("window["+org.json.JSONObject.quote(key)+"]||\"\"",value->{
      try{String data=new org.json.JSONArray("["+value+"]").getString(0);if(data.isEmpty()){pollExport(key,mime,attempts+1);return;}
        web.evaluateJavascript("delete window["+org.json.JSONObject.quote(key)+"]",null);
        int comma=data.indexOf(',');if(!data.startsWith("data:")||comma<0||data.length()>2800000)throw new IOException();
        pendingExport=android.util.Base64.decode(data.substring(comma+1),android.util.Base64.DEFAULT);if(pendingExport.length>2000000)throw new IOException();
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime==null?"application/octet-stream":mime).putExtra(Intent.EXTRA_TITLE,"electrotutor-export"+(mime!=null&&mime.contains("svg")?".svg":mime!=null&&mime.contains("csv")?".csv":".json"));startActivityForResult(intent,11);
      }catch(Exception error){pendingExport=null;exporting=false;Toast.makeText(this,"Экспорт не выполнен",Toast.LENGTH_LONG).show();}
    }),100);
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==10&&chooser!=null){chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));chooser=null;}
    if(request==11){try{if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingExport!=null){try(OutputStream stream=getContentResolver().openOutputStream(data.getData())){if(stream==null)throw new IOException();stream.write(pendingExport);}}}catch(IOException e){Toast.makeText(this,"Файл не сохранён",Toast.LENGTH_LONG).show();}finally{pendingExport=null;exporting=false;}}
  }

  @Override protected void onDestroy(){if(isFinishing()){root.removeView(web);web.destroy();}super.onDestroy();}
}
