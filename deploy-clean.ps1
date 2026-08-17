# GM Helper — complete clean FTP deployment to futuremagic.de
#
# Builds with Vite base /GM_Helper/, wipes the remote app directory, uploads
# dist/, then registers the app on futuremagic.de via Register-FuturemagicApp.ps1.
#
# Usage (from repo root):
#   .\deploy-clean.ps1
#   npm run deploy:domainfactory
#
# Password: $env:FTP_PASSWORD, or User env FTP_PASSWORD, or interactive prompt.

param(
    [string]$FtpServer = "ftp.futuremagic.de",
    [string]$FtpUser = "12529-Pyrion",
    [string]$RemotePath = "/webseiten/GM_Helper/",
    [string]$BasePath = "/GM_Helper/",
    [string]$PublicUrl = "https://futuremagic.de/GM_Helper/",
    [string]$Slug = "GM_Helper",
    [string]$Title = "GM Cockpit"
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

function Normalize-FtpDir([string]$path) {
    $p = $path.Replace('\', '/')
    if (-not $p.StartsWith('/')) { $p = "/$p" }
    if (-not $p.EndsWith('/')) { $p = "$p/" }
    return $p
}

function Normalize-WebBase([string]$path) {
    $p = $path.Replace('\', '/')
    if (-not $p.StartsWith('/')) { $p = "/$p" }
    if (-not $p.EndsWith('/')) { $p = "$p/" }
    return $p
}

$RemotePath = Normalize-FtpDir $RemotePath
$BasePath = Normalize-WebBase $BasePath
$RegisterScript = "C:\Projekte\Futuremagic\scripts\Register-FuturemagicApp.ps1"

Write-Host "Starting COMPLETE CLEAN GM Cockpit deployment..." -ForegroundColor Red
Write-Host "This will delete ALL files under remote $RemotePath" -ForegroundColor Yellow
Write-Host "Vite base: $BasePath" -ForegroundColor Cyan
Write-Host "Public URL: $PublicUrl" -ForegroundColor Cyan

try {
    Write-Host "Cleaning build folder..." -ForegroundColor Yellow
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force "dist"
    }

    Write-Host "Building application for domainfactory..." -ForegroundColor Yellow
    $env:GM_HELPER_BASE = $BasePath
    npm run build:domainfactory
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build:domainfactory failed with exit code $LASTEXITCODE"
    }

    Write-Host "Copying .htaccess..." -ForegroundColor Yellow
    if (-not (Test-Path "public\.htaccess")) {
        throw "public/.htaccess is missing"
    }
    Copy-Item "public\.htaccess" "dist\.htaccess" -Force
    $htaccessPath = Join-Path $RepoRoot "dist\.htaccess"
    $htaccessBody = [System.IO.File]::ReadAllText($htaccessPath)
    $htaccessBody = $htaccessBody -replace '(?m)^(\s*RewriteBase\s+)\S+', "`${1}$BasePath"
    # Apache rejects .htaccess with a UTF-8 BOM (common Windows PowerShell Set-Content pitfall).
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($htaccessPath, $htaccessBody.TrimStart([char]0xFEFF), $utf8NoBom)

    if (Test-Path "public\futuremagic.json") {
        Copy-Item "public\futuremagic.json" "dist\futuremagic.json" -Force
    }

    if (-not (Test-Path "dist\index.html")) {
        throw "Build failed - no index.html found"
    }

    Write-Host "Build successful!" -ForegroundColor Green

    $criticalFiles = @(
        "dist\index.html",
        "dist\.htaccess"
    )
    if (Test-Path "dist\futuremagic.json") {
        $criticalFiles += "dist\futuremagic.json"
    }

    foreach ($file in $criticalFiles) {
        if (-not (Test-Path $file)) {
            throw "Critical file missing: $file"
        }
    }

    $totalFiles = (Get-ChildItem -Path "dist" -Recurse -File).Count
    Write-Host "Preparing to upload $totalFiles files..." -ForegroundColor Cyan

    $FTP_PASSWORD = $env:FTP_PASSWORD
    if (-not $FTP_PASSWORD) {
        try {
            $FTP_PASSWORD = [Environment]::GetEnvironmentVariable("FTP_PASSWORD", "User")
            if ($FTP_PASSWORD) {
                Write-Host "Retrieved password from user environment variables" -ForegroundColor Green
                $env:FTP_PASSWORD = $FTP_PASSWORD
            }
        } catch {
            # Ignore errors
        }
    }

    if (-not $FTP_PASSWORD) {
        Write-Host "Enter FTP password:" -ForegroundColor Yellow
        $SecurePassword = Read-Host -AsSecureString
        $BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
        try {
            $FTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        }
    } else {
        Write-Host "Using stored password" -ForegroundColor Green
    }

    if (-not $FTP_PASSWORD) {
        throw "FTP password is required"
    }

    Write-Host "COMPLETELY CLEANING remote directory..." -ForegroundColor Red

    function Remove-FTPDirectory {
        param([string]$RemoteDir)

        try {
            $listRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteDir")
            $listRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails
            $listRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)

            $response = $listRequest.GetResponse()
            $responseStream = $response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($responseStream)
            $listing = $reader.ReadToEnd()
            $reader.Close()
            $response.Close()

            $lines = $listing.Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)

            foreach ($line in $lines) {
                if ($line.Trim() -and -not $line.StartsWith("total")) {
                    $parts = $line.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
                    if ($parts.Length -gt 0) {
                        $fileName = $parts[-1]
                        $isDirectory = $line.StartsWith("d") -or ($line -match "<DIR>")

                        if ($fileName -and $fileName -ne "." -and $fileName -ne "..") {
                            $fullPath = "$RemoteDir$fileName"

                            if ($isDirectory) {
                                Write-Host "Removing directory: $fileName" -ForegroundColor Red
                                Remove-FTPDirectory "$fullPath/"

                                try {
                                    $rmDirRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$fullPath")
                                    $rmDirRequest.Method = [System.Net.WebRequestMethods+Ftp]::RemoveDirectory
                                    $rmDirRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
                                    $rmDirResponse = $rmDirRequest.GetResponse()
                                    $rmDirResponse.Close()
                                } catch {
                                    Write-Host "Could not remove directory $fileName" -ForegroundColor Gray
                                }
                            } else {
                                Write-Host "Removing file: $fileName" -ForegroundColor Red
                                try {
                                    $deleteRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$fullPath")
                                    $deleteRequest.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
                                    $deleteRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
                                    $deleteResponse = $deleteRequest.GetResponse()
                                    $deleteResponse.Close()
                                } catch {
                                    Write-Host "Could not remove file $fileName" -ForegroundColor Gray
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            Write-Host "Could not list directory $RemoteDir (may be empty or new)" -ForegroundColor Gray
        }
    }

    # Ensure remote app root exists, then clean it
    try {
        $mkdirRoot = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemotePath")
        $mkdirRoot.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $mkdirRoot.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
        $mkdirRootResponse = $mkdirRoot.GetResponse()
        $mkdirRootResponse.Close()
        Write-Host "Created remote directory: $RemotePath" -ForegroundColor Blue
    } catch {
        # Already exists
    }

    Remove-FTPDirectory $RemotePath

    Write-Host "Uploading fresh files..." -ForegroundColor Green

    $files = Get-ChildItem -Path "dist" -Recurse -File
    $uploaded = 0
    $failed = @()
    $distRoot = (Resolve-Path "dist").Path

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($distRoot.Length + 1).Replace('\', '/')
        $remoteFile = "$RemotePath$relativePath"

        $pathParts = $relativePath.Split('/')
        if ($pathParts.Length -gt 1) {
            $currentPath = $RemotePath
            for ($i = 0; $i -lt ($pathParts.Length - 1); $i++) {
                $currentPath = "$currentPath$($pathParts[$i])/"
                try {
                    $mkdirRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$currentPath")
                    $mkdirRequest.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
                    $mkdirRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
                    $mkdirResponse = $mkdirRequest.GetResponse()
                    $mkdirResponse.Close()
                    Write-Host "Created directory: $($pathParts[$i])" -ForegroundColor Blue
                } catch {
                    # Directory might already exist
                }
            }
        }

        try {
            $ftpRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$remoteFile")
            $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
            $ftpRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
            $ftpRequest.UseBinary = $true
            $ftpRequest.UsePassive = $true
            $ftpRequest.Timeout = 300000

            $fileContent = [System.IO.File]::ReadAllBytes($file.FullName)
            $ftpRequest.ContentLength = $fileContent.Length
            $requestStream = $ftpRequest.GetRequestStream()
            $requestStream.Write($fileContent, 0, $fileContent.Length)
            $requestStream.Close()

            $response = $ftpRequest.GetResponse()
            $response.Close()

            $uploaded++
            $sizeKB = [math]::Round($fileContent.Length / 1KB, 1)
            Write-Host "Uploaded: $relativePath ($sizeKB KB)" -ForegroundColor Green
        } catch {
            $failed += $relativePath
            Write-Host "Failed: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "=== DEPLOYMENT VERIFICATION ===" -ForegroundColor Cyan

    foreach ($criticalFile in @("index.html", ".htaccess")) {
        try {
            $verifyRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemotePath$criticalFile")
            $verifyRequest.Method = [System.Net.WebRequestMethods+Ftp]::GetFileSize
            $verifyRequest.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FTP_PASSWORD)
            $verifyResponse = $verifyRequest.GetResponse()
            $fileSize = $verifyResponse.ContentLength
            $verifyResponse.Close()
            Write-Host "[OK] $criticalFile verified ($fileSize bytes)" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] $criticalFile MISSING!" -ForegroundColor Red
            $failed += $criticalFile
        }
    }

    if ($failed.Count -gt 0) {
        Write-Host ""
        Write-Host "=== FAILED UPLOADS ===" -ForegroundColor Red
        foreach ($failedFile in $failed) {
            Write-Host "[FAIL] $failedFile" -ForegroundColor Red
        }
        throw "Deployment completed with $($failed.Count) failed file(s). Check the errors above."
    }

    Write-Host ""
    Write-Host "COMPLETE CLEAN DEPLOYMENT finished! Uploaded $uploaded/$totalFiles files." -ForegroundColor Green
    Write-Host "App should now work at: $PublicUrl" -ForegroundColor Cyan

    if (Test-Path $RegisterScript) {
        Write-Host ""
        & $RegisterScript `
            -Slug $Slug `
            -Title $Title `
            -Path $BasePath `
            -FtpPassword $FTP_PASSWORD `
            -ManifestoLocalPath (Join-Path $RepoRoot "dist\futuremagic.json") `
            -AppRemoteDir $RemotePath
    } else {
        Write-Host "[SKIP] Futuremagic registry helper not found: $RegisterScript" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
