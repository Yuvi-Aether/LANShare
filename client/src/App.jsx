import { useEffect, useRef, useState } from "react";

const SERVER = window.location.origin;

function App() {
  // ==========================================
  // State
  // ==========================================

  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const [message, setMessage] = useState("");

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [uploadRequest, setUploadRequest] = useState(null);
  // ========================================
  // Device Discovery State
  // ========================================

  const [deviceName, setDeviceName] = useState(
    localStorage.getItem("deviceName") || ""
  );

  const [showDeviceSetup, setShowDeviceSetup] =
    useState(
      !localStorage.getItem("deviceName")
    );

  const [devices, setDevices] = useState([]);


  // ==========================================
  // Load shared files
  // ==========================================

  const loadFiles = async () => {
    try {
      const response = await fetch(`${SERVER}/files`);

      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const data = await response.json();

      setFiles(data);
    } catch (error) {
      console.error("Load files error:", error);

      setMessage(
        "Unable to connect to LANShare server"
      );
    }
  };

  // ==========================================
  // Load Devices
  // ==========================================

  const loadDevices = async () => {
    try {
      const response = await fetch(
        `${SERVER}/api/devices`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load devices"
        );
      }

      const data = await response.json();

      setDevices(data);
    } catch (error) {
      console.error(
        "Device discovery error:",
        error
      );
    }
  };

  // ========================================
  // Register This Device
  // ========================================

  const registerDevice = async () => {
    const name = deviceName.trim();

    if (!name) {
      return;
    }

    try {
      const response = await fetch(
        `${SERVER}/api/devices/register`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            name: name
          })
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to register device"
        );
      }

      localStorage.setItem(
        "deviceName",
        name
      );

      setShowDeviceSetup(false);

      loadDevices();

    } catch (error) {
      console.error(
        "Device registration error:",
        error
      );
    }
  };

  // ==========================================
  // Load files when application starts
  // ==========================================

  useEffect(() => {
    loadFiles();
  }, []);

  // ==========================================
  // Automatically refresh shared files
  // ==========================================

  useEffect(() => {
    const fileInterval = setInterval(() => {
      loadFiles();
    }, 5000);

    return () => {
      clearInterval(fileInterval);
    };
  }, []);
  // ==========================================
  // Device Heartbeat
  // ==========================================

  useEffect(() => {
    if (!deviceName) {
      return;
    }

    const register = async () => {
      try {
        await fetch(
          `${SERVER}/api/devices/register`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              name: deviceName
            })
          }
        );

        loadDevices();

      } catch (error) {
        console.error(
          "Device registration error:",
          error
        );
      }
    };

    register();

    const heartbeatInterval = setInterval(
      async () => {
        try {
          await fetch(
            `${SERVER}/api/devices/heartbeat`,
            {
              method: "POST"
            }
          );

          loadDevices();

        } catch (error) {
          console.error(
            "Heartbeat error:",
            error
          );
        }
      },
      5000
    );

    return () => {
      clearInterval(
        heartbeatInterval
      );
    };

  }, [deviceName]);

  // ==========================================
  // Clear Selected File
  // ==========================================

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setMessage("");
    setUploadProgress(0);
    setUploadSpeed(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  // ==========================================
  // Upload file
  // ==========================================

  const uploadFile = () => {
    if (!selectedFile) {
      setMessage("Please select a file");
      return;
    }

    const formData = new FormData();

    formData.append("file", selectedFile);

    const xhr = new XMLHttpRequest();

    setUploadRequest(xhr);

    const startTime = Date.now();

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setMessage("Uploading...");


    // ======================================
    // Upload progress
    // ======================================

    xhr.upload.addEventListener(
      "progress",
      (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percentage =
          (event.loaded / event.total) * 100;

        setUploadProgress(
          Math.round(percentage)
        );


        // Calculate upload speed

        const elapsedSeconds =
          (Date.now() - startTime) / 1000;

        if (elapsedSeconds > 0) {
          const bytesPerSecond =
            event.loaded / elapsedSeconds;

          setUploadSpeed(
            bytesPerSecond
          );
        }
      }
    );


    // ======================================
    // Upload completed
    // ======================================

    xhr.addEventListener(
      "load",
      () => {
        setUploading(false);
        setUploadRequest(null);

        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          try {
            const data =
              JSON.parse(
                xhr.responseText
              );

            setMessage(
              data.message ||
              "Upload completed"
            );

            setUploadProgress(100);

            loadFiles();

          } catch (error) {
            console.error(
              "Response parsing error:",
              error
            );

            setMessage(
              "Upload completed"
            );

            setUploadProgress(100);
          }

        } else {

          let errorMessage =
            "Upload failed";

          try {
            const data =
              JSON.parse(
                xhr.responseText
              );

            if (data.error) {
              errorMessage =
                data.error;
            }

          } catch {
            // Ignore JSON parsing error
          }

          setMessage(errorMessage);
        }
      }
    );


    // ======================================
    // Upload cancelled
    // ======================================

    xhr.addEventListener(
      "abort",
      () => {
        setUploading(false);
        setUploadRequest(null);

        setUploadProgress(0);
        setUploadSpeed(0);

        setMessage(
          "Upload cancelled"
        );
      }
    );


    // ======================================
    // Upload error
    // ======================================

    xhr.addEventListener(
      "error",
      () => {
        setUploading(false);
        setUploadRequest(null);

        setMessage(
          "Network error during upload"
        );
      }
    );


    // ======================================
    // Start upload
    // ======================================

    xhr.open(
      "POST",
      `${SERVER}/upload`
    );

    xhr.send(formData);
  };


  // ==========================================
  // Cancel upload
  // ==========================================

  const cancelUpload = () => {
    if (uploadRequest) {
      uploadRequest.abort();
    }
  };


  // ==========================================
  // Format bytes
  // ==========================================

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) {
      return "0 B";
    }

    const units = [
      "B",
      "KB",
      "MB",
      "GB",
      "TB"
    ];

    const index = Math.floor(
      Math.log(bytes) / Math.log(1024)
    );

    return (
      (bytes /
        Math.pow(1024, index)
      ).toFixed(2)
      + " "
      + units[index]
    );
  };


  // ==========================================
  // Device Name Setup
  // ==========================================

  if (showDeviceSetup) {
    return (
      <div
        style={{
          maxWidth: "500px",
          margin: "100px auto",
          padding: "30px",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <h1>
          LANShare
        </h1>

        <p>
          Choose a name for this device.
        </p>

        <input
          type="text"
          value={deviceName}
          onChange={(event) => {
            setDeviceName(
              event.target.value
            );
          }}
          placeholder="e.g. Yuvraj-Laptop"
          style={{
            width: "100%",
            padding: "10px",
            boxSizing: "border-box",
            fontSize: "16px"
          }}
        />

        <button
          onClick={registerDevice}
          disabled={!deviceName.trim()}
          style={{
            marginTop: "15px",
            padding: "10px 20px",
            cursor:
              !deviceName.trim()
                ? "not-allowed"
                : "pointer"
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "50px auto",
        fontFamily: "Arial, sans-serif",
        padding: "20px"
      }}
    >

      {/* ================================= */}
      {/* Header */}
      {/* ================================= */}

      <h1>
        LANShare
      </h1>

      <p>
        Local Network File Sharing
      </p>


      <hr />


      {/* ================================= */}
      {/* Upload section */}
      {/* ================================= */}

      <h2>
        Upload File
      </h2>


      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginTop: "10px"
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files[0];

            setSelectedFile(file || null);

            setMessage("");

            setUploadProgress(0);
            setUploadSpeed(0);
          }}
        />

        <button
          onClick={clearSelectedFile}
          disabled={uploading || !selectedFile}
          style={{
            padding: "6px 14px",
            cursor:
              uploading || !selectedFile
                ? "not-allowed"
                : "pointer"
          }}
        >
          Clear
        </button>

        <button
          onClick={uploadFile}
          disabled={
            uploading ||
            !selectedFile
          }
          style={{
            padding: "6px 14px",
            cursor:
              uploading || !selectedFile
                ? "not-allowed"
                : "pointer"
          }}
        >
          {uploading
            ? "Uploading..."
            : "Upload"}
        </button>

        {uploading && (
          <button
            onClick={cancelUpload}
            style={{
              padding: "6px 14px",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        )}
      </div>



      {/* ================================= */}
      {/* Selected file information */}
      {/* ================================= */}

      {selectedFile && (
        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            background: "#f5f5f5",
            borderRadius: "5px"
          }}
        >

          <strong>
            Selected file:
          </strong>

          <br />

          {selectedFile.name}

          <br />

          <small>
            Size:{" "}
            {formatBytes(
              selectedFile.size
            )}
          </small>

        </div>
      )}


      {/* ================================= */}
      {/* Upload progress */}
      {/* ================================= */}

      {uploading && (
        <div
          style={{
            marginTop: "20px"
          }}
        >

          <div
            style={{
              width: "100%",
              height: "20px",
              background: "#ddd",
              borderRadius: "10px",
              overflow: "hidden"
            }}
          >

            <div
              style={{
                width:
                  `${uploadProgress}%`,
                height: "100%",
                background: "#4caf50",
                transition:
                  "width 0.2s"
              }}
            />

          </div>


          <p>
            <strong>
              {uploadProgress}%
            </strong>

            {" • "}

            {formatBytes(
              uploadSpeed
            )}

            /s
          </p>

        </div>
      )}


      {/* ================================= */}
      {/* Message */}
      {/* ================================= */}

      {message && (
        <p>
          {message}
        </p>
      )}


      <hr />
      
      {/* ================================= */}
      {/* Devices on LAN */}
      {/* ================================= */}
      <div
        style={{
          marginTop: "30px",
          marginBottom: "30px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px"
        }}
      >
        <h2>
          Devices on LAN
        </h2>

        {devices.length === 0 ? (
          <p>
            No devices found.
          </p>
        ) : (
          <ul>
            {devices.map((device) => (
              <li
                key={device.ip}
                style={{
                  marginBottom: "10px"
                }}
              >
                <strong>
                  {device.name}
                </strong>

                {" — "}

                {device.ip}

                {device.name === deviceName && (
                  <span>
                    {" "} (This device)
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ================================= */}
      {/* Shared files */}
      {/* ================================= */}

      <h2>
        Shared Files
      </h2>
      {files.length === 0 ? (

        <p>
          No files available
        </p>

      ) : (

        <ul>

          {files.map((file) => (

            <li
              key={file.name}
              style={{
                marginBottom: "12px"
              }}
            >

              <strong>
                {file.name}
              </strong>

              {" "}

              (
              {formatBytes(
                file.size
              )}
              )

              {" "}

              <a
                href={
                  `${SERVER}/download/` +
                  encodeURIComponent(
                    file.name
                  )
                }
              >
                Download
              </a>

            </li>

          ))}

        </ul>
      )}

    </div>
  );
}

export default App;