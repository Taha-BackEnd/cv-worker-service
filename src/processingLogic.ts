import { extractTextFromCv } from './utils/cvParser';
import { fetchAllLists, postCandidateUpdates, ApiListItem } from './services/apiClient';
import { callStage1_ExtractCvData, callStage2_MatchExpertise } from './services/openAiService';
import * as fs from 'fs/promises'; // We need this for deleting the file
import dotenv from 'dotenv';
import { downloadFileFromUrl } from './utils/fileDownloader';
import { chunkTextByTokens } from './utils/textChunker';
dotenv.config();

export const performCvProcessing = async (jobPayload: any) => {
    const { candidateId, fileUrl, jobCategory, preSelectedSpeciality } = jobPayload;
    let tempFilePath: string | null = null; // A variable to hold the temp path

    try {
        // 1. Extract text from the CV file
        tempFilePath = await downloadFileFromUrl(fileUrl);
        const cvText = await extractTextFromCv(tempFilePath);
        console.log(`Extracted CV text length: ${cvText}`);

        const textChunks = chunkTextByTokens(cvText, 10000);
        const stage1Promises = textChunks.map(chunk => callStage1_ExtractCvData(chunk));
        const stage1PartialResults = await Promise.all(stage1Promises);

        // --- REDUCE: Consolidate the new, structured results ---
        const consolidatedData: { [key: string]: any } = {
            rawExpertiseAndSkills: new Set<string>(),
            organizationDetails: [],
            education: [],
        };
        const simpleFields: { [key: string]: any } = {};

        for (const result of stage1PartialResults) {
            // Handle simple fields (take the first one found)
            if (result.address && !simpleFields.address) simpleFields.address = result.address;
            if (result.city && !simpleFields.city) simpleFields.city = result.city;
            if (result.gender && !simpleFields.gender) simpleFields.gender = result.gender;
            
            // Aggregate array fields
            if (result.workExperienceCountries) consolidatedData.workExperienceCountries = [...(consolidatedData.workExperienceCountries || []), ...result.workExperienceCountries];
            if (result.organizationDetails) consolidatedData.organizationDetails.push(...result.organizationDetails);
            if (result.education) consolidatedData.education.push(...result.education);
            if (result.rawExpertiseAndSkills) result.rawExpertiseAndSkills.forEach((item: string) => consolidatedData.rawExpertiseAndSkills.add(item));
        }

        const consolidatedExpertise: string[] = Array.from(consolidatedData.rawExpertiseAndSkills);
        console.log(`Consolidated Expertise: ${consolidatedExpertise}, ${consolidatedExpertise.length} items`);
        
        // --- Stage 2: Matching ---
        const allLists = await fetchAllLists(jobCategory, preSelectedSpeciality?._id);
        const listNames = {
            subSpecialities: allLists.subSpecialities.map(i => i.name),
            privileges: allLists.privileges.map(i => i.name),
            skills: allLists.skills.map(i => i.name),
        };
        console.log(listNames);
        console.log(jobCategory);
        const stage2Matches = await callStage2_MatchExpertise(consolidatedExpertise, listNames, jobCategory, preSelectedSpeciality);

        // --- Build Final Payload ---
        const finalPayload = { ...simpleFields };
        if (consolidatedData.organizationDetails.length > 0) finalPayload.organizationDetails = consolidatedData.organizationDetails;
        if (consolidatedData.education.length > 0) finalPayload.education = consolidatedData.education;
        if (consolidatedData.workExperienceCountries?.length > 0) {
            // Remove duplicates
            finalPayload.workExperienceCountries = [...new Set(consolidatedData.workExperienceCountries)];
        }

        // Map matched skill names back to ObjectIds
        if (stage2Matches.matchedSkills?.length > 0) {
            finalPayload.skills = allLists.skills
                .filter((s: any) => stage2Matches.matchedSkills.includes(s.name))
                .map((s: any) => s._id);
        }

        // Conditionally add medical specialization details
        if (jobCategory === 'Medical') {
            const subSpecialityIds = allLists.subSpecialities
                .filter((s: any) => stage2Matches.matchedSubSpecialities?.includes(s.name))
                .map((s: any) => s._id);
            const privilegeIds = allLists.privileges
                .filter((p: any) => stage2Matches.matchedPrivileges?.includes(p.name))
                .map((p: any) => p._id);
            
            finalPayload.specialization = {
                jobSubSpeciality: subSpecialityIds,
                jobPrivilage: privilegeIds
            };
        }
        console.log('Final Payload to be sent:', finalPayload);
        await postCandidateUpdates(candidateId, finalPayload);

        console.log(`✅ Successfully processed and updated profile for candidate: ${candidateId}`);
        
    }catch(err){
        console.error(`Error processing CV for candidate ${candidateId}:`, err);
        throw err;
    }finally {
        // 4. ALWAYS CLEAN UP THE TEMPORARY FILE
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
                console.log(`Cleaned up temporary file: ${tempFilePath}`);
            } catch (cleanupError) {
                console.error(`Failed to clean up temporary file ${tempFilePath}:`, cleanupError);
            }
        }
    }
};