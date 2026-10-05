import { useEffect, useState } from "react";

const SERVER = window.location.origin;

function App() {
    // ==========================================
    // State
    // ==========================================

    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);

    const [message, setMessage] = useState("");

    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [uploading, setUploading] = useState(false);

    const [uploadRequest, setUploadRequest] = useState(null);
    


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
    // Load files when application starts
    // ==========================================

    useEffect(() => {
        loadFiles();
    }, []);


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


            <input
                type="file"
                disabled={uploading}
                onChange={(event) => {
                    const file =
                        event.target.files[0];

                    setSelectedFile(file || null);

                    setMessage("");

                    setUploadProgress(0);
                    setUploadSpeed(0);
                }}
            />


            <div
                style={{
                    marginTop: "15px"
                }}
            >

                <button
                    onClick={uploadFile}
                    disabled={
                        uploading ||
                        !selectedFile
                    }
                    style={{
                        padding: "8px 16px",
                        marginRight: "10px",
                        cursor:
                            uploading ||
                            !selectedFile
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
                            padding: "8px 16px",
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