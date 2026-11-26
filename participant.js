
// PHASE 1 COURSE - PARTICIPANT MANAGEMENT

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";
const BUCKET = "phase1-result-pdfs";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");
const list = document.getElementById("participant-list");
const searchInput = document.getElementById("participant-search");

let registrations = [];
let completions = [];
let documents = [];
let adminUser = null;

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function showMessage(text) {
    message.textContent = text;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeFilename(name) {
    const clean = String(name || "Participant")
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, "_");

    return (clean || "Participant") + ".pdf";
}

function getParticipant(registration) {
    return registration.participants || {};
}

function getCompletion(registrationId) {
    return completions.find(
        item => item.registration_id === registrationId
    );
}

function getLatestDocument(completionId) {
    return documents
        .filter(item => item.completion_id === completionId)
        .sort((a, b) => b.version - a.version)[0];
}

// --------------------------------------------------
// ADMIN VERIFICATION
// --------------------------------------------------

async function verifyAdmin() {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        window.location.href = "admin.html";
        return false;
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (
        profileError ||
        !["admin", "super_admin"].includes(profile?.role)
    ) {
        await db.auth.signOut();
        window.location.href = "admin.html";
        return false;
    }

    adminUser = data.session.user;
    return true;
}

// --------------------------------------------------
// LOAD DATA
// --------------------------------------------------

async function loadParticipants() {
    try {
        showMessage("Loading participants...");
        list.replaceChildren();

        const { data, error } = await db
            .from("registrations")
            .select(`
                id,
                registration_number,
                section,
                status,
                participants (
                    full_name,
                    contact_number,
                    school_troop,
                    district,
                    email
                ),
                results (
                    marks,
                    grade,
                    remarks
                )
            `)
            .eq("batch_id", BATCH_ID)
            .neq("status", "cancelled")
            .order("registration_number", { ascending: true });

        if (error) throw error;

        registrations = data || [];

        const [completionResult, documentResult] = await Promise.all([
            db.from("course_completions").select("*"),

            db.from("result_documents")
                .select("*")
                .order("version", { ascending: false })
        ]);

        if (completionResult.error) throw completionResult.error;
        if (documentResult.error) throw documentResult.error;

        completions = completionResult.data || [];
        documents = documentResult.data || [];

        displayParticipants(registrations);

    } catch (error) {
        showMessage("Could not load participants: " + error.message);
    }
}

// --------------------------------------------------
// PARTICIPANT TABLE
// --------------------------------------------------

function displayParticipants(items) {
    list.replaceChildren();

    if (!items.length) {
        showMessage("No matching participants found.");
        return;
    }

    showMessage(`Showing ${items.length} participant(s).`);

    const table = document.createElement("table");
    table.className = "participant-table";

    const headers = [
        "Registration No.",
        "Participant Name",
        "Section",
        "School / Troop",
        "Contact Number",
        "District",
        "Email",
        "Registration Status",
        "Course Complete",
        "Result Sheet"
    ];

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    headers.forEach(title => {
        const th = document.createElement("th");
        th.textContent = title;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    items.forEach(registration => {
        const participant = getParticipant(registration);
        const completion = getCompletion(registration.id);

        const row = document.createElement("tr");

        const values = [
            registration.registration_number,
            participant.full_name,
            registration.section,
            participant.school_troop,
            participant.contact_number,
            participant.district,
            participant.email,
            registration.status
        ];

        values.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value || "-";
            row.appendChild(td);
        });

        // COMPLETION CHECKBOX

        const completionCell = document.createElement("td");
        const label = document.createElement("label");
        label.className = "completion-control";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked =
            completion?.completion_status === "completed";

        const labelText = document.createElement("span");
        labelText.textContent = "Completed";

        label.append(checkbox, labelText);
        completionCell.appendChild(label);

        // PDF BUTTON

        const pdfCell = document.createElement("td");
        pdfCell.className = "participant-actions";

        const pdfButton = document.createElement("button");
        pdfButton.type = "button";
        pdfButton.textContent = "Download Result PDF";
        pdfButton.disabled =
            completion?.completion_status !== "completed";

        pdfCell.appendChild(pdfButton);

        row.append(completionCell, pdfCell);
        tbody.appendChild(row);

        // SAVE COMPLETION

        checkbox.addEventListener("change", async () => {
            const requestedValue = checkbox.checked;

            checkbox.disabled = true;
            pdfButton.disabled = true;

            showMessage(
                `Saving completion status for ${participant.full_name}...`
            );

            try {
                const completionDate = requestedValue
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Colombo"
                    }).format(new Date())
                    : null;

                const { data, error } = await db
                    .from("course_completions")
                    .upsert({
                        registration_id: registration.id,
                        completion_status: requestedValue
                            ? "completed"
                            : "pending",
                        completion_date: completionDate,
                        approved_by: adminUser.id,
                        approved_at: new Date().toISOString()
                    }, {
                        onConflict: "registration_id"
                    })
                    .select("*")
                    .single();

                if (error) throw error;

                const index = completions.findIndex(
                    item => item.registration_id === registration.id
                );

                if (index >= 0) {
                    completions[index] = data;
                } else {
                    completions.push(data);
                }

                pdfButton.disabled = !requestedValue;

                showMessage(
                    `${participant.full_name}: completion status saved successfully.`
                );

            } catch (error) {
                checkbox.checked = !requestedValue;

                pdfButton.disabled =
                    !checkbox.checked;

                showMessage(
                    "Could not save completion: " + error.message
                );

            } finally {
                checkbox.disabled = false;
            }
        });

        // DOWNLOAD PDF

        pdfButton.addEventListener("click", async () => {
            const currentCompletion = getCompletion(registration.id);

            if (
                !currentCompletion ||
                currentCompletion.completion_status !== "completed"
            ) {
                showMessage("Mark this participant as completed first.");
                return;
            }

            pdfButton.disabled = true;
            pdfButton.textContent = "Preparing PDF...";

            try {
                let documentRecord = getLatestDocument(
                    currentCompletion.id
                );

                if (!documentRecord) {
                    showMessage("Generating official result sheet...");

                    documentRecord = await generatePDF(
                        registration,
                        currentCompletion
                    );
                }

                const { data: file, error } = await db.storage
                    .from(BUCKET)
                    .download(documentRecord.storage_path);

                if (error) throw error;

                const url = URL.createObjectURL(file);
                const link = document.createElement("a");

                link.href = url;
                link.download = safeFilename(participant.full_name);

                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(url), 1500);

                showMessage(
                    `Result sheet downloaded for ${participant.full_name}.`
                );

                pdfButton.textContent = "Download Again";

            } catch (error) {
                showMessage("PDF download failed: " + error.message);
                pdfButton.textContent = "Download Result PDF";

            } finally {
                pdfButton.disabled = false;
            }
        });
    });

    table.append(thead, tbody);
    list.appendChild(table);
}

// --------------------------------------------------
// OFFICIAL RESULT SHEET DESIGN
// --------------------------------------------------

async function createResultSheet(registration, completion) {
    const participant = getParticipant(registration);

    const result = Array.isArray(registration.results)
        ? registration.results[0]
        : registration.results;

    const sheet = document.createElement("div");

    sheet.style.cssText = `
        width: 180mm;
        min-height: 255mm;
        padding: 13mm;
        background: #ffffff;
        color: #24352b;
        font-family: Arial, sans-serif;
        box-sizing: border-box;
    `;

    sheet.innerHTML = `
        <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            border-bottom:3px solid #245b40;
            padding-bottom:18px;
        ">
            <img
                src="mp.png?v=3"
                alt="Organization Logo"
                style="width:85px;height:85px;object-fit:contain;"
            >

            <div style="text-align:center;flex:1;padding:0 12px;">
                <h1 style="
                    color:#183d2b;
                    font-size:23px;
                    margin:0 0 7px;
                ">
                    PHASE 1 COURSE
                </h1>

                <h2 style="
                    font-size:14px;
                    margin:0;
                    letter-spacing:1px;
                ">
                    SCOUT LEADER DEVELOPMENT
                </h2>

                <p style="
                    font-size:12px;
                    margin:8px 0 0;
                    color:#637568;
                ">
                    OFFICIAL PARTICIPANT RESULT SHEET
                </p>
            </div>

            <img
                src="sl.png?v=3"
                alt="Scout Logo"
                style="width:85px;height:85px;object-fit:contain;"
            >
        </div>

        <div style="
            margin-top:28px;
            padding:13px;
            background:#edf4ee;
            border-left:4px solid #245b40;
        ">
            <h3 style="margin:0;color:#245b40;font-size:15px;">
                PARTICIPANT INFORMATION
            </h3>
        </div>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-top:12px;
            font-size:13px;
        ">
            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;width:38%;">
                    <strong>Registration Number</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(registration.registration_number)}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Full Name</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(participant.full_name)}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>School / Troop</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(participant.school_troop)}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>District</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(participant.district)}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Scouting Section</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(registration.section)}
                </td>
            </tr>
        </table>

        <div style="
            margin-top:25px;
            padding:13px;
            background:#edf4ee;
            border-left:4px solid #245b40;
        ">
            <h3 style="margin:0;color:#245b40;font-size:15px;">
                COURSE RESULTS
            </h3>
        </div>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-top:12px;
            font-size:13px;
        ">
            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;width:38%;">
                    <strong>Completion Status</strong>
                </td>
                <td style="
                    padding:12px;
                    border-bottom:1px solid #ddd;
                    color:#267347;
                    font-weight:bold;
                ">
                    COMPLETED
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Completion Date</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(completion.completion_date || "-")}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Marks</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(result?.marks ?? "Not recorded")}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Grade</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(result?.grade || "Not recorded")}
                </td>
            </tr>

            <tr>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    <strong>Remarks</strong>
                </td>
                <td style="padding:12px;border-bottom:1px solid #ddd;">
                    ${escapeHTML(result?.remarks || "-")}
                </td>
            </tr>
        </table>

        <div style="
            display:flex;
            justify-content:space-between;
            margin-top:75px;
            font-size:12px;
            text-align:center;
        ">
            <div style="width:43%;">
                __________________________
                <p>Authorized Signature</p>
            </div>

            <div style="width:43%;">
                __________________________
                <p>Course Coordinator</p>
            </div>
        </div>

        <div style="
            margin-top:40px;
            padding-top:12px;
            border-top:1px solid #dce5dd;
            text-align:center;
            font-size:10px;
            color:#758078;
        ">
            PHASE 1 COURSE · SCOUT LEADER DEVELOPMENT
            <br>
            Official Course Administration Document
        </div>
    `;

    document.body.appendChild(sheet);

    // Wait for both logos to load before creating the PDF.
    const images = Array.from(sheet.querySelectorAll("img"));

    await Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(
                new Error("Could not load a course logo for the PDF.")
            );
        });
    }));

    return sheet;
}

// --------------------------------------------------
// GENERATE AND STORE PDF
// --------------------------------------------------

async function generatePDF(registration, completion) {
    const { data: previousDocuments, error: versionError } = await db
        .from("result_documents")
        .select("version")
        .eq("completion_id", completion.id)
        .order("version", { ascending: false })
        .limit(1);

    if (versionError) throw versionError;

    const version = (previousDocuments?.[0]?.version || 0) + 1;

    const sheet = await createResultSheet(registration, completion);

    let pdfBlob;

    try {
        pdfBlob = await html2pdf()
            .set({
                margin: 5,
                image: {
                    type: "jpeg",
                    quality: 0.98
                },
                html2canvas: {
                    scale: 2,
                    useCORS: true
                },
                jsPDF: {
                    unit: "mm",
                    format: "a4",
                    orientation: "portrait"
                }
            })
            .from(sheet)
            .outputPdf("blob");

    } finally {
        sheet.remove();
    }

    const filePath =
        `${registration.registration_number}/result-v${version}.pdf`;

    const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filePath, pdfBlob, {
            contentType: "application/pdf",
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data: savedDocument, error: recordError } = await db
        .from("result_documents")
        .insert({
            completion_id: completion.id,
            document_number:
                `${registration.registration_number}-V${version}`,
            storage_path: filePath,
            version,
            generated_by: adminUser.id
        })
        .select("*")
        .single();

    if (recordError) {
        throw new Error(
            "PDF uploaded, but document record failed: " +
            recordError.message
        );
    }

    documents.push(savedDocument);

    return savedDocument;
}

// --------------------------------------------------
// SEARCH
// --------------------------------------------------

searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = registrations.filter(registration => {
        const participant = getParticipant(registration);

        const searchableText = [
            registration.registration_number,
            registration.section,
            registration.status,
            participant.full_name,
            participant.contact_number,
            participant.school_troop,
            participant.district,
            participant.email
        ].join(" ").toLowerCase();

        return searchableText.includes(query);
    });

    displayParticipants(filtered);
});

// --------------------------------------------------
// START
// --------------------------------------------------

async function start() {
    try {
        if (!await verifyAdmin()) return;

        await loadParticipants();

    } catch (error) {
        showMessage("System error: " + error.message);
    }
}

start();
