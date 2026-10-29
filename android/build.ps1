param([string]$SdkRoot=$env:ANDROID_SDK_ROOT,[string]$JdkRoot=$env:JAVA_HOME,[switch]$SkipWebBuild)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$SdkRoot){$SdkRoot=Join-Path $env:LOCALAPPDATA 'Android/Sdk'}
if(!$JdkRoot){$JdkRoot=Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'}
$SdkRoot=[IO.Path]::GetFullPath($SdkRoot);$JdkRoot=[IO.Path]::GetFullPath($JdkRoot)
$tools=Join-Path $SdkRoot 'build-tools/36.0.0';$platform=Join-Path $SdkRoot 'platforms/android-35/android.jar'
foreach($path in @($platform,(Join-Path $tools 'aapt2.exe'),(Join-Path $JdkRoot 'bin/javac.exe'))){if(!(Test-Path -LiteralPath $path)){throw "Missing Android prerequisite: $path"}}
if(!$SkipWebBuild){Push-Location $projectRoot;try{$env:SITE_URL='https://electrotutor.pages.dev';$env:BASE_PATH='/';& pnpm.cmd build;if($LASTEXITCODE -ne 0){throw 'Web production build failed'}}finally{Pop-Location}}
if(!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist/ru/index.html'))){throw 'Run SITE_URL=https://electrotutor.pages.dev BASE_PATH=/ pnpm build first.'}
function Invoke-Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw "Build tool failed: $Program ($LASTEXITCODE)"}}
$output=Join-Path $PSScriptRoot 'build';$work=Join-Path $output ('work-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $output,$work,(Join-Path $work 'classes'),(Join-Path $work 'dex'),(Join-Path $work 'generated'),(Join-Path $work 'assets/site') | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'dist/*') -Destination (Join-Path $work 'assets/site') -Recurse
Invoke-Checked (Join-Path $tools 'aapt2.exe') @('compile','--dir',(Join-Path $PSScriptRoot 'res'),'-o',(Join-Path $work 'resources.zip'))
Invoke-Checked (Join-Path $tools 'aapt2.exe') @('link','-o',(Join-Path $work 'unsigned.apk'),'--manifest',(Join-Path $PSScriptRoot 'AndroidManifest.xml'),'-I',$platform,'-A',(Join-Path $work 'assets'),'--java',(Join-Path $work 'generated'),(Join-Path $work 'resources.zip'))
$sources=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -Filter '*.java' | ForEach-Object FullName)
Invoke-Checked (Join-Path $JdkRoot 'bin/javac.exe') (@('--release','8','-encoding','UTF-8','-classpath',$platform,'-d',(Join-Path $work 'classes'))+$sources)
Invoke-Checked (Join-Path $JdkRoot 'bin/jar.exe') @('cf',(Join-Path $work 'classes.jar'),'-C',(Join-Path $work 'classes'),'.')
$env:JAVA_HOME=$JdkRoot
Invoke-Checked (Join-Path $tools 'd8.bat') @('--lib',$platform,'--min-api','26','--output',(Join-Path $work 'dex'),(Join-Path $work 'classes.jar'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open((Join-Path $work 'unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try{
# SDK aapt2 on Windows can emit backslashes in asset entry names. Android requires '/'.
foreach($entry in @($zip.Entries)){if($entry.FullName.Contains('\')){$normalized=$zip.CreateEntry($entry.FullName.Replace('\','/'),[IO.Compression.CompressionLevel]::Optimal);$input=$entry.Open();$destination=$normalized.Open();try{$input.CopyTo($destination)}finally{$input.Dispose();$destination.Dispose()};$entry.Delete()}}
[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $work 'dex/classes.dex'),'classes.dex') | Out-Null}finally{$zip.Dispose()}
Invoke-Checked (Join-Path $tools 'zipalign.exe') @('-f','-p','4',(Join-Path $work 'unsigned.apk'),(Join-Path $work 'aligned.apk'))
$key=Join-Path $output 'debug.keystore'
if(!(Test-Path -LiteralPath $key)){Invoke-Checked (Join-Path $JdkRoot 'bin/keytool.exe') @('-genkeypair','-keystore',$key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=Android Debug,O=Android,C=US','-keyalg','RSA','-validity','10000','-noprompt')}
$apk=Join-Path $output 'electrotutor-debug.apk'
Invoke-Checked (Join-Path $tools 'apksigner.bat') @('sign','--ks',$key,'--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,(Join-Path $work 'aligned.apk'))
Invoke-Checked (Join-Path $tools 'apksigner.bat') @('verify','--verbose',$apk)
Write-Output "APK: $apk"
Get-FileHash -LiteralPath $apk -Algorithm SHA256
