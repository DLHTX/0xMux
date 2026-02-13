class Oxmux < Formula
  desc "Hacker-grade tmux session manager with web UI"
  homepage "https://github.com/DLHTX/0xMux"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/DLHTX/0xMux/releases/download/v#{version}/0xmux-darwin-arm64.tar.gz"
      sha256 "SHA256_DARWIN_ARM64"
    end

    if Hardware::CPU.intel?
      url "https://github.com/DLHTX/0xMux/releases/download/v#{version}/0xmux-darwin-x64.tar.gz"
      sha256 "SHA256_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/DLHTX/0xMux/releases/download/v#{version}/0xmux-linux-x64.tar.gz"
      sha256 "SHA256_LINUX_X64"
    end
  end

  def install
    bin.install "oxmux-server" => "0xmux"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/0xmux --version")
  end
end
