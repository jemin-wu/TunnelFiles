cask "tunnelfiles" do
  version "1.0.0"

  on_arm do
    url "https://github.com/jemin-wu/TunnelFiles/releases/download/v#{version}/TunnelFiles_#{version}_aarch64.dmg"
    sha256 :no_check
  end

  on_intel do
    url "https://github.com/jemin-wu/TunnelFiles/releases/download/v#{version}/TunnelFiles_#{version}_x64.dmg"
    sha256 :no_check
  end

  name "TunnelFiles"
  desc "Visual SSH/SFTP file manager"
  homepage "https://github.com/jemin-wu/TunnelFiles"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "TunnelFiles.app"

  zap trash: [
    "~/Library/Application Support/com.wuminjian.tunnelfiles",
    "~/Library/Caches/com.wuminjian.tunnelfiles",
    "~/Library/Preferences/com.wuminjian.tunnelfiles.plist",
    "~/Library/Saved Application State/com.wuminjian.tunnelfiles.savedState",
  ]
end
