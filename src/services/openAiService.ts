import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Stage 1: Extracts raw data and expertise from CV text
export const callStage1_ExtractCvData = async (cvTextChunk: string): Promise<any> => {
    console.log('Calling OpenAI Stage 1: Extraction...');
    const prompt = `
    You are an AI parsing a piece of a resume. Extract the following details if present in this text chunk.
    If a field is not found, omit it or use an empty array/null.

    **Desired JSON Structure:**
    {
      "address": "string | null",
      "city": "string | null",
      "gender": "'Male' or 'Female' | null",
      "workExperienceCountries": ["string"],
      "organizationDetails": [
        { "name": "string", "role": "string", "startWorkingDate": "YYYY-MM-DD", "endWorkingDate": "YYYY-MM-DD", "present": boolean }
      ],
      "education": [
        { "highestEdu": "string", "university": "string", "graduation": "YYYY-MM-DD", "degreeLevel": "string" }
      ],
      "rawExpertiseAndSkills": ["string"]
    }

    **CV Text Chunk:**
    """${cvTextChunk}"""

    Respond ONLY with the valid JSON object.
  `;


    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125", // Or another model that supports JSON mode -> gpt-4-1106-preview
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
};

// Stage 2: Matches extracted expertise against your DB lists
export const callStage2_MatchExpertise = async (rawExpertise: string[], 
    availableLists: any,
    jobCategory: string,
    preSelectedSpeciality?: { name: string }
): Promise<any> => {
    console.log('Calling OpenAI Stage 2: Matching...');
    let medicalSection = '';

    if (jobCategory === 'Medical' && preSelectedSpeciality) {
        medicalSection = `
          **Medical Context:**
          The candidate's primary speciality is already set to "${preSelectedSpeciality.name}".
          Based on the "Candidate's Expertise", select the most relevant sub-specialities and privileges from the lists 
          below that fall under this primary speciality.

          **Available Sub-Specialities (Choose multiple):**
          ${JSON.stringify(availableLists.subSpecialities)}

          **Available Privileges (Choose multiple):**
          ${JSON.stringify(availableLists.privileges)}
        `;
    }

    const prompt = `
      You are an AI data mapper. Match the "Candidate's Expertise" to the predefined lists of professional terms.

      ${medicalSection}

      **General Skills Context:**
      Based on the "Candidate's Expertise", select all relevant skills from the list below.

      **Available Skills (Choose multiple):**
      ${JSON.stringify(availableLists.skills)}

      **Candidate's Expertise to Analyze:**
      ${JSON.stringify(rawExpertise)}

      **Desired JSON Response Format:**
      {
        "matchedSubSpecialities": ["string"],
        "matchedPrivileges": ["string"],
        "matchedSkills": ["string"]
      }
      If a category is not applicable (e.g., non-medical candidate), return an empty array for it.
      Respond ONLY with the JSON object.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
};